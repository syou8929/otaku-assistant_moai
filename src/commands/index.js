const profileCommand = require('./profile');
const maintenanceCommand = require('./maintenance');
const animeCommand = require('./anime');

const list = [
  profileCommand,
  maintenanceCommand,
  animeCommand
];

module.exports = {
  list,
  registrationData: list
    .filter((command) => command.enabled !== false)
    .map((command) => command.data.toJSON())
};
