const resolveCommand = require('./resolve');
const unresolveCommand = require('./unresolve');
const profileCommand = require('./profile');
const maintenanceCommand = require('./maintenance');
const introCommand = require('./intro');
const animeCommand = require('./anime');

const list = [
  resolveCommand,
  unresolveCommand,
  profileCommand,
  maintenanceCommand,
  introCommand,
  animeCommand
];

module.exports = {
  list,
  registrationData: list
    .filter((command) => command.enabled !== false)
    .map((command) => command.data.toJSON())
};
