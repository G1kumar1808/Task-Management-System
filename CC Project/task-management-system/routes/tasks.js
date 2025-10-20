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

// ========== HELPER FUNCTIONS ==========
// Helper function to format time for comments
function formatTime(dateString) {
  try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
          // If invalid date, try to parse as time string
          if (typeof dateString === 'string' && dateString.includes(':')) {
              return dateString; // Return as-is if it looks like a time
          }
          return 'Unknown time';
      }
      return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
      });
  } catch (error) {
      console.error('Error formatting time:', error);
      return 'Unknown time';
  }
}

// Helper function to get user initials
function getInitials(username) {
  if (!username || typeof username !== 'string') {
      return 'U';
  }
  return username
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
}
// ========== END HELPER FUNCTIONS ==========

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
      // build object URL (may be private; consider presigned GET instead)
      fileUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${encodeURIComponent(req.body.fileKey)}`;
    }

      const newTask = {
        id: `t_${Date.now()}`,
        name: taskName,
        description: taskDescription,
        // session stores userId as userId (routes/auth sets userId from UserID)
        createdBy: req.session.user?.userId || req.session.user?.userID || null,
        assignedTo: assignedUsers,
        fileKey: req.body.fileKey || null,
        fileUrl: fileUrl || null,
        createdAt: new Date().toISOString(),
      };

      // store locally and optionally forward to backend API
      try {
        await addTask(newTask);
      } catch (err) {
        console.error('Error saving task to store:', err);
      }

    // Optionally forward to AWS API if configured. Map fields to backend expected shape.
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
          console.warn('Failed to forward task to AWS API: 403 Forbidden - token or permissions issue');
        } else {
          console.warn('Failed to forward task to AWS API:', err.message);
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
router.get("/view-tasks", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  
  try {
    // Fetch tasks from local store first
    let tasks = await getTasks();

    // If there's a backend API configured, try to fetch authoritative tasks
    if (AWS_API_URL) {
      try {
        const resp = await axios.get(`${AWS_API_URL}/tasks`, {
          headers: { Authorization: `Bearer ${req.session.user?.token || ''}` },
        });
        if (resp.data && Array.isArray(resp.data.tasks)) {
          // map backend tasks to internal shape
          const backend = resp.data.tasks.map((it) => ({
            id: it.TaskID || it.id || it.taskId,
            name: it.Name || it.name || it.taskName,
            description: it.Description || it.description || it.taskDescription,
            createdBy: it.CreatedBy || it.createdBy,
            assignedTo: it.AssignedTo || it.assignedTo || [],
            fileKey: it.FileKey || it.fileKey || null,
            fileUrl: it.FileUrl || it.fileUrl || null,
            createdAt: it.CreatedAt || it.createdAt,
          }));
          // Prefer backend list (authoritative)
          tasks = backend;
        }
      } catch (err) {
        // Log details for 403s and other errors
        if (err.response && err.response.status === 403) {
          console.warn('AWS API returned 403 when fetching tasks - check API token/permissions');
        } else {
          console.warn('Failed to fetch tasks from AWS API:', err.message);
        }
        // fall back to local tasks array
      }
    }

    // Fetch all users to map IDs to usernames
    let userMap = {};
    if (AWS_API_URL) {
      try {
        const usersResponse = await axios.get(`${AWS_API_URL}/users`, {
          headers: { Authorization: `Bearer ${req.session.user?.token || ''}` },
        });
        if (usersResponse.data && usersResponse.data.users) {
          usersResponse.data.users.forEach(user => {
            userMap[user.UserID] = user.Username;
          });
        }
      } catch (err) {
        console.warn('Could not fetch users for mapping:', err.message);
      }
    }

    // Map user IDs to usernames in tasks
    tasks = tasks.map(task => {
      // Map createdBy ID to username
      if (task.createdBy && userMap[task.createdBy]) {
        task.createdByUsername = userMap[task.createdBy];
      }
      
      // Map assignedTo IDs to usernames
      if (task.assignedTo && Array.isArray(task.assignedTo)) {
        task.assignedToUsernames = task.assignedTo.map(userId => 
          userMap[userId] || userId
        );
      }
      
      return task;
    });

    // Sort tasks by createdAt date (newest first)
    tasks.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA; // Descending order (newest first)
    });

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

    // Only show tasks created by or assigned to the logged-in user
    const uid = req.session.user?.userId || req.session.user?.userID || null;
    const visible = tasksWithUrls.filter((t) => {
      if (!uid) return false;
      if (t.createdBy && String(t.createdBy) === String(uid)) return true;
      if ((t.assignedTo || []).some((a) => String(a) === String(uid))) return true;
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
});

// Task detail page with comments
router.get("/task/:taskId", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const taskId = req.params.taskId;
  
  // Fetch tasks from both local store and backend API
  let tasks = await getTasks();
  
  // If there's a backend API configured, try to fetch authoritative tasks
  if (AWS_API_URL) {
    try {
      const resp = await axios.get(`${AWS_API_URL}/tasks`, {
        headers: { Authorization: `Bearer ${req.session.user?.token || ''}` },
      });
      if (resp.data && Array.isArray(resp.data.tasks)) {
        const backend = resp.data.tasks.map((it) => ({
          id: it.TaskID || it.id || it.taskId,
          name: it.Name || it.name || it.taskName,
          description: it.Description || it.description || it.taskDescription,
          createdBy: it.CreatedBy || it.createdBy,
          assignedTo: it.AssignedTo || it.assignedTo || [],
          fileKey: it.FileKey || it.fileKey || null,
          fileUrl: it.FileUrl || it.fileUrl || null,
          createdAt: it.CreatedAt || it.createdAt,
        }));
        tasks = backend;
      }
    } catch (err) {
      console.warn('Failed to fetch tasks from AWS API for task detail:', err.message);
    }
  }

  let task = tasks.find((t) => t.id === taskId);

  if (!task) {
    return res
      .status(404)
      .render("error", { 
        title: "Not Found", 
        message: "Task not found",
        user: req.session.user || null 
      });
  }

  // Fetch comments from CommentsTable
  let comments = [];
  try {
    const commentsResult = await dynamodb
      .scan({
        TableName: "CommentsTable",
        FilterExpression: "TaskID = :taskId",
        ExpressionAttributeValues: { ":taskId": taskId },
      })
      .promise();
    comments = commentsResult.Items || [];
  } catch (err) {
    console.warn('Could not fetch comments:', err.message);
  }

  // Fetch all users to map IDs to usernames for comments
  let userMap = {};
  if (AWS_API_URL) {
    try {
      const usersResponse = await axios.get(`${AWS_API_URL}/users`, {
        headers: { Authorization: `Bearer ${req.session.user?.token || ''}` },
      });
      if (usersResponse.data && usersResponse.data.users) {
        usersResponse.data.users.forEach(user => {
          userMap[user.UserID] = user.Username;
        });
      }
    } catch (err) {
      console.warn('Could not fetch users for comment mapping:', err.message);
    }
  }

  // Map user IDs to usernames in comments
  comments = comments.map(comment => {
    if (comment.UserID && userMap[comment.UserID]) {
      comment.Username = userMap[comment.UserID];
    } else {
      comment.Username = 'User'; // Fallback username
    }
    return comment;
  });

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

  // Sort comments by creation date (newest first)
  commentsWithUrls.sort((a, b) => {
    const dateA = new Date(a.CreatedAt || 0);
    const dateB = new Date(b.CreatedAt || 0);
    return dateB - dateA;
  });

  res.render("task-detail", {
    title: task.name,
    user: req.session.user || null,
    task: task,
    comments: commentsWithUrls,
    formatTime: formatTime, // Pass the helper function to the template
    getInitials: getInitials // Pass the helper function to the template
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

// Search users by email or username (simple proxied call to AWS API or dummy data)
router.get("/search-users", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const q = (req.query.q || "").toLowerCase();

  console.log('Search users query:', q);

  if (AWS_API_URL) {
    try {
      let users = [];
      
      // Always try to get all users first from the /users endpoint
      try {
        const allUsersResp = await axios.get(`${AWS_API_URL}/users`, {
          headers: { Authorization: `Bearer ${req.session.user?.token || ""}` },
        });
        if (allUsersResp.data && allUsersResp.data.users) {
          users = allUsersResp.data.users;
        }
      } catch (err) {
        console.warn('Failed to get all users from API, trying search endpoint:', err.message);
        // If /users endpoint fails, try the search endpoint
        const searchResp = await axios.get(`${AWS_API_URL}/users/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${req.session.user?.token || ""}` },
        });
        if (searchResp.data && searchResp.data.users) {
          users = searchResp.data.users;
        }
      }

      // Filter users if there's a search query
      if (q && users.length > 0) {
        users = users.filter(user => 
          user.Username.toLowerCase().includes(q) || 
          (user.Email && user.Email.toLowerCase().includes(q))
        );
      }

      console.log('Returning users:', users.length);
      return res.json(users);
    } catch (err) {
      console.warn("User search via API failed:", err.message);
      // Fallback to dummy data
      return getDummyUsers(q, res);
    }
  }

  // Fallback to dummy data if no AWS_API_URL
  getDummyUsers(q, res);
});

// Helper function for dummy users
function getDummyUsers(q, res) {
  const dummy = [
    { UserID: "u123", Username: "AliceSmith", Email: "alice@example.com" },
    { UserID: "u456", Username: "BobJohnson", Email: "bob@example.com" },
    { UserID: "u789", Username: "CharlieBrown", Email: "charlie@example.com" },
    { UserID: "u101", Username: "DianaPrince", Email: "diana@example.com" },
    { UserID: "u112", Username: "EthanHunt", Email: "ethan@example.com" },
  ];
  
  let users = dummy;
  
  // Filter if there's a query
  if (q) {
    users = dummy.filter((u) =>
      u.Username.toLowerCase().includes(q) || 
      u.Email.toLowerCase().includes(q)
    );
  }
  
  console.log('Returning dummy users:', users.length);
  res.json(users);
}

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