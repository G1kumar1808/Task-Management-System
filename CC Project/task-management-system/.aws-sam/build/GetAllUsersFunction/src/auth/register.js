const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    console.log('Registration event:', event);
    
    const { username, email, password } = JSON.parse(event.body);

    // Check if user exists
    const existingUser = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: 'Email = :email',
      ExpressionAttributeValues: { ':email': email }
    }).promise();

    if (existingUser.Items.length > 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'User already exists', success: false })
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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