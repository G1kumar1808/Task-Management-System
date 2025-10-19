const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const TASKS_TABLE = process.env.TASKS_TABLE || 'TasksTable';
const ASSIGNMENTS_TABLE = process.env.TASK_ASSIGNMENTS_TABLE || 'TaskAssignmentsTable';
const inMemory = [];

let dynamo;
// Only create a client if AWS credentials/region are present OR if env var is set
if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_REGION || TASKS_TABLE) {
  dynamo = new AWS.DynamoDB.DocumentClient();
}

// addTask: store to DynamoDB TasksTable and create TaskAssignments in TaskAssignmentsTable
async function addTask(task) {
  if (dynamo) {
    const item = {
      TaskID: task.id || `t_${Date.now()}`,
      Name: task.name,
      Description: task.description,
      CreatedBy: task.createdBy,
      AssignedTo: task.assignedTo || [],
      FileKey: task.fileKey || null,
      FileUrl: task.fileUrl || null,
      CreatedAt: task.createdAt || new Date().toISOString(),
    };

    // Put into TasksTable
    await dynamo.put({ TableName: TASKS_TABLE, Item: item }).promise();

    // Create assignments entries for each assigned user in TaskAssignmentsTable
    const assigned = item.AssignedTo || [];
    for (const userId of assigned) {
      const assignment = {
        AssignmentID: uuidv4(),
        TaskID: item.TaskID,
        UserID: userId,
        AssignedAt: new Date().toISOString(),
      };
      try {
        await dynamo.put({ TableName: ASSIGNMENTS_TABLE, Item: assignment }).promise();
      } catch (err) {
        // log and continue; assignments are best-effort
        console.warn('Failed to write task assignment for', userId, err.message || err);
      }
    }

    return item;
  }

  // fallback to in-memory
  inMemory.push(task);
  return task;
}

// getTasks: scan TasksTable or return in-memory
async function getTasks() {
  if (dynamo) {
    const resp = await dynamo.scan({ TableName: TASKS_TABLE }).promise();
    return (resp.Items || []).map((it) => ({
      id: it.TaskID,
      name: it.Name,
      description: it.Description,
      createdBy: it.CreatedBy,
      assignedTo: it.AssignedTo || [],
      fileKey: it.FileKey || null,
      fileUrl: it.FileUrl || null,
      createdAt: it.CreatedAt,
    }));
  }

  return inMemory;
}

module.exports = { addTask, getTasks };
