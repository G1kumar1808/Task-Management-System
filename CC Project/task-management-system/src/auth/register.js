const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  // Add CORS headers
  cconst headers = {
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
    console.log('Registration event:', JSON.stringify(event, null, 2));
    
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

    const { username, email, password } = body;

    // Validate required fields
    if (!username || !email || !password) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Username, email, and password are required', 
          success: false 
        })
      };
    }

    // Check if user exists by email
    const existingUserResult = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: 'Email = :email',
      ExpressionAttributeValues: { ':email': email }
    }).promise();

    if (existingUserResult.Items && existingUserResult.Items.length > 0) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ 
          message: 'User with this email already exists', 
          success: false 
        })
      };
    }

    // Check if username already exists
    const existingUsernameResult = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: 'Username = :username',
      ExpressionAttributeValues: { ':username': username }
    }).promise();

    if (existingUsernameResult.Items && existingUsernameResult.Items.length > 0) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ 
          message: 'Username already taken', 
          success: false 
        })
      };
    }

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const userID = uuidv4();

    const newUser = {
      UserID: userID,
      Username: username,
      Email: email,
      Password: hashedPassword,
      Role: 'User',
      CreatedAt: new Date().toISOString(),
      LastLogin: null
    };

    await dynamodb.put({
      TableName: process.env.USERS_TABLE,
      Item: newUser
    }).promise();

    console.log('User created successfully:', userID);

    return {
      statusCode: 201,
      headers: headers,
      body: JSON.stringify({ 
        message: 'User registered successfully!', 
        success: true,
        user: { 
          UserID: userID, 
          Username: username, 
          Email: email, 
          Role: 'User' 
        }
      })
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ 
        message: 'Server error during registration', 
        success: false, 
        error: error.message 
      })
    };
  }
};