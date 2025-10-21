const express = require("express");
const router = express.Router();
const axios = require("axios"); 
const AWS_API_URL = process.env.AWS_API_URL;

// Home page
router.get("/", (req, res) => {
  res.render("home", {
    title: "Task Management System",
    user: req.session.user || null,
    formData: {},
    success: null,
    error: null,
  });
});

// Login page
router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.render("login", {
    title: "Login",
    error: null,
    success: req.query.success || null,
    user: req.session.user || null,
    formData: {},
  });
});

// Register page
router.get("/register", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.render("register", {
    title: "Register",
    error: null,
    user: req.session.user || null,
    formData: {},
    success: null
  });
});

// Dashboard page
router.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("dashboard", {
    title: "Dashboard",
    user: req.session.user || null,
    formData: {},
    error: null,
    success: null,
  });
});

// Create task page
const fetchAllUsers = async (token) => {
  if (!AWS_API_URL) {
    console.warn("AWS_API_URL is not set. Returning dummy data.");
    return [
      { UserID: "u123", Username: "AliceSmith" },
      { UserID: "u456", Username: "BobJohnson" },
      { UserID: "u789", Username: "CharlieBrown" },
    ];
  }
  try {
    const response = await axios.get(`${AWS_API_URL}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data.users || [];
  } catch (error) {
    console.error("Error fetching users from API:", error.message);
    return [
      { UserID: "u123", Username: "AliceSmith" },
      { UserID: "u456", Username: "BobJohnson" },
    ];
  }
};

router.get("/create-task", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  let users = [];
  try {
    users = await fetchAllUsers(req.session.user.token);
  } catch (error) {
    console.error("Error fetching users for create-task page:", error);
    return res.render("create-task", {
      title: "Create Task",
      user: req.session.user,
      users: [],
      message: "Error loading users for assignment. Please try again.",
      success: null // Add this
    });
  }

  res.render("create-task", {
    title: "Create Task",
    user: req.session.user,
    users: users,
    message: null,
    success: null // Add this
  });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/");
  });
});

module.exports = router;