const profileCommand = require('./profile');
const maintenanceCommand = require('./maintenance');

const list = [
  profileCommand,
  maintenanceCommand
];

module.exports = {
  list,
  registrationData: list
    .filter((command) => command.enabled !== false)
    .map((command) => command.data.toJSON())
};
