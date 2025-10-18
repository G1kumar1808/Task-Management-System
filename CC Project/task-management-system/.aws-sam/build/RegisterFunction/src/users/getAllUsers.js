const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    console.log('Getting all users...');
    
    // Get all users from DynamoDB
    const result = await dynamodb.scan({
      TableName: process.env.USERS_TABLE
    }).promise();

    console.log('Found users:', result.Items.length);

    // Remove passwords from response for security
    const users = result.Items.map(user => ({
      UserID: user.UserID,
      Username: user.Username,
      Email: user.Email,
      Role: user.Role,
      CreatedAt: user.CreatedAt,
      LastLogin: user.LastLogin
    }));

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify({ 
        message: 'Users retrieved successfully!',
        success: true,
        count: users.length,
        users: users
      })
    };
  } catch (error) {
    console.error('Error getting users:', error);
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify({ 
        message: 'Failed to get users',
        success: false,
        error: error.message
      })
    };
  }
};