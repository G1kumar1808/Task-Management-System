const express = require("express");
const axios = require("axios");
const router = express.Router();

const AWS_API_URL = process.env.AWS_API_URL;

// Register user
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const response = await axios.post(`${AWS_API_URL}/register`, {
      username,
      email,
      password,
    });

    if (response.data.success) {
      res.redirect("/login?success=Registration successful! Please login.");
    } else {
      res.render("register", {
        title: "Register",
        error: response.data.message,
        formData: { username, email },
        user: req.session.user || null,
      });
    }
  } catch (error) {
    console.error("Registration error:", error.response?.data || error.message);

    let errorMessage = "Registration failed. Please try again.";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    res.render("register", {
      title: "Register",
      error: errorMessage,
      formData: req.body,
      user: req.session.user || null,
    });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await axios.post(`${AWS_API_URL}/login`, {
      email,
      password,
    });

    if (response.data.success) {
      // Store user in session
      req.session.user = {
        userId: response.data.user.UserID,
        username: response.data.user.Username,
        email: response.data.user.Email,
        role: response.data.user.Role,
        token: response.data.token,
      };

      res.redirect("/dashboard");
    } else {
      res.render("login", {
        title: "Login",
        error: response.data.message,
        formData: { email },
        user: req.session.user || null,
      });
    }
  } catch (error) {
    console.error("Login error:", error.response?.data || error.message);

    let errorMessage = "Login failed. Please try again.";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    res.render("login", {
      title: "Login",
      error: errorMessage,
      formData: req.body,
      user: req.session.user || null,
    });
  }
});

module.exports = router;
