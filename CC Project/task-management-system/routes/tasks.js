const express = require("express");
const router = express.Router();
const multer = require("multer");
const AWS = require("aws-sdk");
const { addTask, getTasks } = require("../utils/tasksStore");
const axios = require("axios");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const S3_BUCKET = process.env.AWS_S3_BUCKET;
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

// Create task endpoint (expects fileKey if file uploaded via presigned URL)
router.post("/create-task", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { taskName, taskDescription } = req.body;
  // assignedUsers may be CSV or array
  let assignedUsers = req.body.assignedUsers || [];
  if (typeof assignedUsers === "string") {
    assignedUsers = assignedUsers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // If client performed presigned upload, it should send fileKey (S3 object key).
  let fileUrl = null;
  try {
    if (req.body.fileKey) {
      // build object URL (may be private; you may want to use presigned GET instead)
      fileUrl = `https://${S3_BUCKET}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${encodeURIComponent(req.body.fileKey)}`;
    }

    const newTask = {
      id: `t_${Date.now()}`,
      name: taskName,
      description: taskDescription,
      createdBy: req.session.user.userId || req.session.user.userId,
      assignedTo: assignedUsers,
      fileKey: req.body.fileKey || null,
      fileUrl: fileUrl || null,
      createdAt: new Date().toISOString(),
    };

    // store locally and optionally forward to backend API
    addTask(newTask);

    // Optionally forward to AWS API if configured
    if (AWS_API_URL) {
      try {
        await axios.post(`${AWS_API_URL}/tasks`, newTask, {
          headers: { Authorization: `Bearer ${req.session.user?.token || ""}` },
        });
      } catch (err) {
        console.warn("Failed to forward task to AWS API:", err.message);
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
      const tasks = getTasks();
      // For tasks with fileKey, generate presigned download urls
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

      res.render("view-tasks", {
        title: "Your Tasks",
        user: req.session.user || null,
        tasks: tasksWithUrls,
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

// Search users by email or username (simple proxied call to AWS API or dummy data)
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

  // fallback dummy search
  const dummy = [
    { UserID: "u123", Username: "AliceSmith", Email: "alice@example.com" },
    { UserID: "u456", Username: "BobJohnson", Email: "bob@example.com" },
  ];
  const filtered = dummy.filter((u) =>
    (u.Username + u.Email).toLowerCase().includes(q)
  );
  res.json(filtered);
});

// Presign upload URL (PUT) for browser direct upload
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

// Presign download URL (GET) if you need to expose temporary download links
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
