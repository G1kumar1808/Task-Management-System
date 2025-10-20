const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  // Add CORS headers
  const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Allows requests from any domain
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', // Allowed HTTP methods
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With' // Allowed headers
};

// Handle preflight OPTIONS request (browser sends this first)
if (event.httpMethod === 'OPTIONS') {
  return {
    statusCode: 200,
    headers: headers,
    body: ''
  };
}

// Your normal response
return {
  statusCode: 200,
  headers: headers, // Include headers in all responses
  body: JSON.stringify({...})
};

  try {
    console.log('Login event:', JSON.stringify(event, null, 2));
    
    // Check if table name is configured
    if (!process.env.USERS_TABLE) {
      throw new Error('USERS_TABLE environment variable is not configured');
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Invalid JSON in request body', 
          success: false 
        })
      };
    }

    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Email and password are required', 
          success: false 
        })
      };
    }

    // Find user by email
    const userResult = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: 'Email = :email',
      ExpressionAttributeValues: { ':email': email }
    }).promise();

    if (!userResult.Items || userResult.Items.length === 0) {
      return {
        statusCode: 401,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Invalid email or password', 
          success: false 
        })
      };
    }

    const user = userResult.Items[0];
    
    // Check if user has a password (in case of malformed data)
    if (!user.Password) {
      return {
        statusCode: 401,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Invalid email or password', 
          success: false 
        })
      };
    }

    const isPasswordValid = await bcrypt.compare(password, user.Password);
    
    if (!isPasswordValid) {
      return {
        statusCode: 401,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Invalid email or password', 
          success: false 
        })
      };
    }

    // Update last login
    await dynamodb.update({
      TableName: process.env.USERS_TABLE,
      Key: { UserID: user.UserID },
      UpdateExpression: 'set LastLogin = :lastLogin',
      ExpressionAttributeValues: {
        ':lastLogin': new Date().toISOString()
      }
    }).promise();

    // Generate token - use environment variable for secret
    const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
    const token = jwt.sign(
      { 
        userId: user.UserID, 
        email: user.Email, 
        role: user.Role 
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ 
        message: 'Login successful!', 
        success: true,
        token: token,
        user: { 
          UserID: user.UserID, 
          Username: user.Username, 
          Email: user.Email, 
          Role: user.Role 
        }
      })
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ 
        message: 'Server error during login', 
        success: false,
        error: error.message 
      })
    };
  }
};