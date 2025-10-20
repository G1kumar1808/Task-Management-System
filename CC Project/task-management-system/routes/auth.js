const express = require("express");
const axios = require("axios");
const router = express.Router();

const AWS_API_URL = process.env.AWS_API_URL;

// Register user
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.render("register", {
        title: "Register",
        error: "All fields are required",
        formData: { username, email },
        user: req.session.user || null,
        success: null // Add this
      });
    }

    if (password.length < 6) {
      return res.render("register", {
        title: "Register",
        error: "Password must be at least 6 characters long",
        formData: { username, email },
        user: req.session.user || null,
        success: null // Add this
      });
    }

    console.log("Attempting registration for:", email);

    const response = await axios.post(`${AWS_API_URL}/register`, {
      username,
      email,
      password,
    });

    console.log("Registration response:", response.data);

    if (response.data.success) {
      res.redirect("/login?success=Registration successful! Please login.");
    } else {
      res.render("register", {
        title: "Register",
        error: response.data.message || "Registration failed",
        formData: { username, email },
        user: req.session.user || null,
        success: null // Add this
      });
    }
  } catch (error) {
    console.error("Registration error:", error.response?.data || error.message);

    let errorMessage = "Registration failed. Please try again.";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = "Cannot connect to authentication service. Please try again later.";
    }

    res.render("register", {
      title: "Register",
      error: errorMessage,
      formData: req.body,
      user: req.session.user || null,
      success: null // Add this
    });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("=== LOGIN ATTEMPT ===");
    console.log("Email:", email);
    console.log("AWS_API_URL:", AWS_API_URL);

    // Basic validation
    if (!email || !password) {
      console.log("Validation failed: missing fields");
      return res.render("login", {
        title: "Login",
        error: "Email and password are required",
        formData: { email },
        user: req.session.user || null,
        success: null
      });
    }

    console.log("Making API call to AWS...");

    try {
      const response = await axios.post(`${AWS_API_URL}/login`, {
        email,
        password,
      }, {
        timeout: 10000 // 10 second timeout
      });

      console.log("API Response Status:", response.status);
      console.log("API Response Data:", JSON.stringify(response.data, null, 2));

      if (response.data.success) {
        console.log("Login successful, creating session");
        // Store user in session
        req.session.user = {
          userId: response.data.user.UserID,
          username: response.data.user.Username,
          email: response.data.user.Email,
          role: response.data.user.Role,
          token: response.data.token,
        };

        console.log("Session created, redirecting to dashboard");
        return res.redirect("/dashboard");
      } else {
        console.log("Login failed in API response");
        return res.render("login", {
          title: "Login",
          error: response.data.message || "Login failed",
          formData: { email },
          user: req.session.user || null,
          success: null
        });
      }
    } catch (apiError) {
      console.error("=== API CALL ERROR ===");
      console.error("API Error Message:", apiError.message);
      console.error("API Error Code:", apiError.code);
      console.error("API Response Status:", apiError.response?.status);
      console.error("API Response Data:", apiError.response?.data);
      
      let errorMessage = "Login service unavailable. Please try again later.";
      
      if (apiError.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError.code === 'ECONNREFUSED') {
        errorMessage = "Cannot connect to authentication service. Please try again later.";
      } else if (apiError.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      }

      return res.render("login", {
        title: "Login",
        error: errorMessage,
        formData: { email },
        user: req.session.user || null,
        success: null
      });
    }

  } catch (error) {
    console.error("=== UNEXPECTED ERROR ===");
    console.error("Error:", error);
    console.error("Error stack:", error.stack);

    return res.render("login", {
      title: "Login",
      error: "Internal server error",
      formData: req.body,
      user: req.session.user || null,
      success: null
    });
  }
});
module.exports = router;