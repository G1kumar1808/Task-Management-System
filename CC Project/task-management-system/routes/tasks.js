const express = require("express");
const router = express.Router();
const multer = require("multer");
const AWS = require("aws-sdk");
const { addTask, getTasks } = require("../utils/tasksStore");
const axios = require("axios");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const S3_BUCKET = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
const AWS_API_URL = process.env.AWS_API_URL;

// configure AWS SDK if credentials are present in environment
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "us-east-1",
  });
}

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Create task endpoint (expects fileKey if file uploaded via presigned URL)
router.post("/create-task", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { taskName, taskDescription } = req.body;
  let assignedUsers = req.body.assignedUsers || [];
  if (typeof assignedUsers === "string") {
    assignedUsers = assignedUsers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let fileUrl = null;
  try {
    if (req.body.fileKey) {
      fileUrl = `https://${S3_BUCKET}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${encodeURIComponent(req.body.fileKey)}`;
    }

    const newTask = {
      id: `t_${Date.now()}`,
      name: taskName,
      description: taskDescription,
      createdBy: req.session.user?.userId || req.session.user?.userID || null,
      assignedTo: assignedUsers,
      fileKey: req.body.fileKey || null,
      fileUrl: fileUrl || null,
      createdAt: new Date().toISOString(),
    };

    try {
      await addTask(newTask);
    } catch (err) {
      console.error("Error saving task to store:", err);
    }

    if (AWS_API_URL) {
      const payload = {
        TaskID: newTask.id,
        Name: newTask.name,
        Description: newTask.description,
        CreatedBy: newTask.createdBy,
        AssignedTo: newTask.assignedTo,
        FileKey: newTask.fileKey,
        FileUrl: newTask.fileUrl,
        CreatedAt: newTask.createdAt,
      };
      try {
        await axios.post(`${AWS_API_URL}/tasks`, payload, {
          headers: { Authorization: `Bearer ${req.session.user?.token || ""}` },
        });
      } catch (err) {
        if (err.response && err.response.status === 403) {
          console.warn(
            "Failed to forward task to AWS API: 403 Forbidden - token or permissions issue"
          );
        } else {
          console.warn("Failed to forward task to AWS API:", err.message);
        }
      }
    }

    res.redirect("/view-tasks");
  } catch (err) {
    console.error("Error creating task:", err);
    res.render("create-task", {
      title: "Create Task",
      user: req.session.user || null,
      users: [],
      message: "Error creating task. Please try again.",
    });
  }
});

// View tasks
router.get("/view-tasks", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  (async () => {
    try {
      let tasks = await getTasks();

      if (AWS_API_URL) {
        try {
          const resp = await axios.get(`${AWS_API_URL}/tasks`, {
            headers: {
              Authorization: `Bearer ${req.session.user?.token || ""}`,
            },
          });
          if (resp.data && Array.isArray(resp.data.tasks)) {
            const backend = resp.data.tasks.map((it) => ({
              id: it.TaskID || it.id || it.taskId,
              name: it.Name || it.name || it.taskName,
              description:
                it.Description || it.description || it.taskDescription,
              createdBy: it.CreatedBy || it.createdBy,
              assignedTo: it.AssignedTo || it.assignedTo || [],
              fileKey: it.FileKey || it.fileKey || null,
              fileUrl: it.FileUrl || it.fileUrl || null,
              createdAt: it.CreatedAt || it.createdAt,
            }));
            tasks = backend;
          }
        } catch (err) {
          if (err.response && err.response.status === 403) {
            console.warn(
              "AWS API returned 403 when fetching tasks - check API token/permissions"
            );
          } else {
            console.warn("Failed to fetch tasks from AWS API:", err.message);
          }
        }
      }
      const tasksWithUrls = await Promise.all(
        tasks.map(async (t) => {
          if (t.fileKey && S3_BUCKET) {
            try {
              const signed = await s3.getSignedUrlPromise("getObject", {
                Bucket: S3_BUCKET,
                Key: t.fileKey,
                Expires: 60,
              });
              return { ...t, downloadUrl: signed };
            } catch (err) {
              console.warn(
                "Failed to sign download for",
                t.fileKey,
                err.message
              );
              return { ...t, downloadUrl: t.fileUrl };
            }
          }
          return { ...t, downloadUrl: t.fileUrl };
        })
      );

      const uid = req.session.user?.userId || req.session.user?.userID || null;
      const visible = tasksWithUrls.filter((t) => {
        if (!uid) return false;
        if (t.createdBy && String(t.createdBy) === String(uid)) return true;
        if ((t.assignedTo || []).some((a) => String(a) === String(uid)))
          return true;
        return false;
      });

      res.render("view-tasks", {
        title: "Your Tasks",
        user: req.session.user || null,
        tasks: visible,
      });
    } catch (err) {
      console.error("Error rendering tasks", err);
      res.render("view-tasks", {
        title: "Your Tasks",
        user: req.session.user || null,
        tasks: [],
      });
    }
  })();
});

// Task detail page with comments
router.get("/task/:taskId", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const taskId = req.params.taskId;
  let task = (await getTasks()).find((t) => t.id === taskId);

  if (!task) {
    return res
      .status(404)
      .render("error", { title: "Not Found", message: "Task not found" });
  }

  // Fetch comments from CommentsTable
  const comments = await dynamodb
    .scan({
      TableName: "CommentsTable",
      FilterExpression: "TaskID = :taskId",
      ExpressionAttributeValues: { ":taskId": taskId },
    })
    .promise()
    .then((data) => data.Items || []);

  // Generate presigned URLs for comment attachments if any
  const commentsWithUrls = await Promise.all(
    comments.map(async (comment) => {
      if (comment.FileKey && S3_BUCKET) {
        try {
          const signedUrl = await s3.getSignedUrlPromise("getObject", {
            Bucket: S3_BUCKET,
            Key: comment.FileKey,
            Expires: 60,
          });
          return { ...comment, FileUrl: signedUrl };
        } catch (err) {
          console.warn(
            "Failed to sign comment attachment download for",
            comment.FileKey,
            err.message
          );
          return { ...comment, FileUrl: null };
        }
      }
      return comment;
    })
  );

  res.render("task-detail", {
    title: task.name,
    user: req.session.user || null,
    task: task,
    comments: commentsWithUrls,
  });
});

// Add comment and file upload
router.post("/add-comment", upload.single("attachment"), async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { taskId, commentText } = req.body;
  const file = req.file;

  let fileKey = null;
  let fileUrl = null;

  if (file) {
    fileKey = `comments/${Date.now()}_${file.originalname}`;
    const params = {
      Bucket: S3_BUCKET,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    await s3.upload(params).promise();
    fileUrl = `https://${S3_BUCKET}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${encodeURIComponent(fileKey)}`;
  }

  const comment = {
    CommentID: `c_${Date.now()}`,
    TaskID: taskId,
    UserID: req.session.user.userId,
    CommentText: commentText,
    FileKey: fileKey,
    FileUrl: fileUrl,
    CreatedAt: new Date().toISOString(),
  };

  await dynamodb
    .put({
      TableName: "CommentsTable",
      Item: comment,
    })
    .promise();

  res.redirect(`/task/${taskId}`);
});

// Search users by email or username
router.get("/search-users", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const q = (req.query.q || "").toLowerCase();
  if (!q) return res.json([]);

  if (AWS_API_URL) {
    try {
      const resp = await axios.get(
        `${AWS_API_URL}/users/search?q=${encodeURIComponent(q)}`,
        {
          headers: { Authorization: `Bearer ${req.session.user?.token || ""}` },
        }
      );
      return res.json(resp.data.users || []);
    } catch (err) {
      console.warn("User search via API failed:", err.message);
      return res.json([]);
    }
  }

  const dummy = [
    { UserID: "u123", Username: "AliceSmith", Email: "alice@example.com" },
    { UserID: "u456", Username: "BobJohnson", Email: "bob@example.com" },
  ];
  const filtered = dummy.filter((u) =>
    (u.Username + u.Email).toLowerCase().includes(q)
  );
  res.json(filtered);
});

// Presign upload URL
router.get("/presign-upload", async (req, res) => {
  const devBypass =
    process.env.NODE_ENV === "development" ||
    process.env.DEV_ALLOW_PRESIGN === "true";
  if (!(req.session.user || devBypass))
    return res.status(401).json({ error: "Unauthorized" });
  if (!S3_BUCKET)
    return res.status(500).json({ error: "S3 bucket not configured" });

  const filename = req.query.filename;
  const contentType = req.query.contentType || "application/octet-stream";
  if (!filename) return res.status(400).json({ error: "filename required" });

  const key = `tasks/${Date.now()}_${filename}`;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  };

  try {
    console.log(
      "presign-upload: filename=",
      filename,
      "requested by",
      req.session?.user?.username || (devBypass ? "dev-bypass" : "anonymous")
    );
    const url = await s3.getSignedUrlPromise("putObject", {
      ...params,
      Expires: 60,
    });
    return res.json({ url, key });
  } catch (err) {
    console.error("Error creating presigned URL", err);
    return res.status(500).json({ error: "Could not create presigned URL" });
  }
});

// Presign download URL
router.get("/presign-download", async (req, res) => {
  const devBypass =
    process.env.NODE_ENV === "development" ||
    process.env.DEV_ALLOW_PRESIGN === "true";
  if (!(req.session.user || devBypass))
    return res.status(401).json({ error: "Unauthorized" });
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: "key required" });
  try {
    console.log(
      "presign-download: key=",
      key,
      "requested by",
      req.session?.user?.username || (devBypass ? "dev-bypass" : "anonymous")
    );
    const url = await s3.getSignedUrlPromise("getObject", {
      Bucket: S3_BUCKET,
      Key: key,
      Expires: 60,
    });
    return res.json({ url });
  } catch (err) {
    console.error("Error creating presigned download URL", err);
    return res
      .status(500)
      .json({ error: "Could not create presigned download URL" });
  }
});

module.exports = router;
