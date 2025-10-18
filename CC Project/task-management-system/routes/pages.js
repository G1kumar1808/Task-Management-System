const express = require("express");
const router = express.Router();

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
