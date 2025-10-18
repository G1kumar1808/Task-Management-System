const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body);

    // Find user
    const userResult = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: 'Email = :email',
      ExpressionAttributeValues: { ':email': email }
    }).promise();

    if (userResult.Items.length === 0) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Invalid credentials', success: false })
      };
    }

    const user = userResult.Items[0];
    const isPasswordValid = await bcrypt.compare(password, user.Password);
    
    if (!isPasswordValid) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Invalid credentials', success: false })
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

    // Generate token
    const token = jwt.sign(
      { userId: user.UserID, email: user.Email, role: user.Role },
      'dev-secret-key',
      { expiresIn: '24h' }
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        message: 'Server error', 
        success: false,
        error: error.message
      })
    };
  }
};