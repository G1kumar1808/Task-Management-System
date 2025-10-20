require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);

// Static files
app.use(express.static(path.join(__dirname, "public")));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ========== ADD HELPER FUNCTIONS HERE ==========
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

// Make these available to EJS templates
app.locals.formatTime = formatTime;
app.locals.getInitials = getInitials;
// ========== END HELPER FUNCTIONS ==========

// Routes
app.use("/", require("./routes/pages"));
app.use("/auth", require("./routes/auth"));
// task routes (create, view, search users)
app.use("/", require("./routes/tasks"));

// Simple 404 handler - renders error page directly
app.use((req, res) => {
  res.status(404).render("error", {
    title: "Page Not Found",
    message: "The page you are looking for does not exist.",
    error: {},
    user: req.session.user || null,
  });
});

// Simple error handler - renders error page directly
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).render("error", {
    title: "Server Error",
    message: "Something went wrong! Please try again later.",
    error: process.env.NODE_ENV === "development" ? err : {},
    user: req.session.user || null,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`AWS API URL: ${process.env.AWS_API_URL || "Not set"}`);
});