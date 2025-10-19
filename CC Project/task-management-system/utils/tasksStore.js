const tasks = [];

function addTask(task) {
  tasks.push(task);
}

function getTasks() {
  return tasks;
}

module.exports = { addTask, getTasks };
