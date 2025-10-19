const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const task = {
      TaskID: uuidv4(),
      Name: body.taskName || "Untitled",
      Description: body.taskDescription || "",
      CreatedBy: body.createdBy || "unknown",
      AssignedTo: body.assignedUsers || [],
      FileKey: body.fileKey || null,
      CreatedAt: new Date().toISOString(),
    };

    await dynamo
      .put({ TableName: process.env.TASKS_TABLE, Item: task })
      .promise();
    return { statusCode: 200, body: JSON.stringify({ success: true, task }) };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create task" }),
    };
  }
};
