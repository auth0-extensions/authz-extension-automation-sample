require('dotenv').load();

const chalk = require('chalk');
const _ = require('lodash');
const Promise = require('bluebird');
const request = require('request-promise');

const log = console.log;
const data = require('./data.json');

const credentials = {
  audience: 'urn:auth0-authz-api',
  client_id: process.env.AUTH0_CLIENT_ID,
  client_secret: process.env.AUTH0_CLIENT_SECRET,
  grant_type: 'client_credentials'
};

getAccessToken()
  .then(accessToken => provision(accessToken, data))
  .catch(err => {
    log(chalk.red.bold('Error:'), JSON.stringify({ error: err.error || err.message, options: err.options }, null, 2));
  });

/*
 * Get an access token for the Authorization Extension API.
 */
function getAccessToken() {
  log(chalk.blue.bold('Authorize:'), `Getting access token for ${credentials.audience}`);
  return request.post({ uri: 'https://' + process.env.AUTH0_DOMAIN + '/oauth/token', form: credentials, json: true })
    .then(res => res.access_token);
}

/*
 * Provision roles, groups and permissions.
 */
function provision(accessToken, data) {
  return Promise.all([ getPermissions(accessToken), getRoles(accessToken), getGroups(accessToken) ])
    .then(([ existingPermissions, existingRoles, existingGroups ]) => {
      Promise.mapSeries(data.applications, (application) =>
        Promise.mapSeries(application.permissions, (permission) =>
          createPermission(accessToken, existingPermissions, application, permission)
        )
      )
      .then(() => Promise.mapSeries(data.applications, (application) =>
          Promise.mapSeries(application.roles, (role) =>
            createRole(accessToken, existingRoles, application, role)
              .then(() => addRolePermissions(accessToken, existingRoles, existingPermissions, application, role))
          )
        ))
      .then(() => Promise.mapSeries(data.groups, (group) =>
        createGroup(accessToken, existingGroups, group)
          .then(() => createNestedGroups(accessToken, existingGroups, group))
      ))
    });
}

/*
 * Get a list of all permissions in the extension.
 */
function getPermissions(accessToken) {
  return request.get({ uri: process.env.AUTHZ_API_URL + '/permissions', json: true, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then(res => {
      log(chalk.green.bold('Permissions:'), `Loaded ${res.permissions.length} permissions.`);
      return res.permissions;
    });
}

/*
 * Create a permission if it doesn't exist yet.
 */
function createPermission(accessToken, existingPermissions, application, permission) {
  const existingPermission = _.find(existingPermissions, { applicationId: application.id, name: permission });
  if (existingPermission) {
    return Promise.resolve(true);
  }

  const payload = {
    name: permission,
    description: permission.replace(/(\w)(\w*)/g, function(g0,g1,g2){return g1.toUpperCase() + g2.toLowerCase();}).replace(':', ' ').replace('-', ' '),
    applicationType: 'client',
    applicationId: application.id
  };

  return request.post({ uri: process.env.AUTHZ_API_URL + '/permissions', json: payload, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then((createdPermission) => {
      existingPermissions.push(createdPermission);
      log(chalk.green.bold('Permission:'), `Created ${permission}`);
      return permission;
    });
}

/*
 * Get a list of all roles in the extension.
 */
function getRoles(accessToken) {
  return request.get({ uri: process.env.AUTHZ_API_URL + '/roles', json: true, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then(res => {
      log(chalk.green.bold('Roles:'), `Loaded ${res.roles.length} roles.`);
      return res.roles;
    });
}

/*
 * Create a role if it doesn't exist yet.
 */
function createRole(accessToken, existingRoles, application, role) {
  const existingRole = _.find(existingRoles, { applicationId: application.id, name: role.name });
  if (existingRole) {
    return Promise.resolve(true);
  }

  const payload = {
    name: role.name,
    description: `The ${role.name} role`,
    applicationType: 'client',
    applicationId: application.id
  };

  return request.post({ uri: process.env.AUTHZ_API_URL + '/roles', json: payload, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then((createdRole) => {
      existingRoles.push(createdRole);
      log(chalk.green.bold('Role:'), `Created ${role.name}`);
      return role;
    });
}

/*
 * Add permsisions to role
 */
function addRolePermissions(accessToken, existingRoles, existingPermissions, application, role) {
  if (!role.permissions || role.permissions.length == 0) {
    return Promise.resolve();
  }

  const existingRole = _.find(existingRoles, { applicationId: application.id, name: role.name });
  const existingRoleId = existingRole._id;
  delete existingRole._id;
  existingRole.permissions = role.permissions.map(permissionName => {
    const permission = _.find(existingPermissions, { applicationId: application.id, name: permissionName });
    return permission._id;
  });

  log(chalk.blue.bold('Role:'), `Adding permissions to ${existingRole.name} (${existingRoleId})...`);
  return request.put({ uri: process.env.AUTHZ_API_URL + '/roles/' + existingRoleId, json: existingRole, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then(() => {
      log(chalk.green.bold('Role:'), `Added ${existingRole.permissions.length} permissions ${role.name}`);
      return Promise.resolve(true);
    });
}


/*
 * Get a list of all groups in the extension.
 */
function getGroups(accessToken) {
  return request.get({ uri: process.env.AUTHZ_API_URL + '/groups', json: true, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then(res => {
      log(chalk.green.bold('Groups:'), `Loaded ${res.groups.length} groups.`);
      return res.groups;
    });
}

/*
 * Create a group if it doesn't exist yet.
 */
function createGroup(accessToken, existingGroups, group) {
  const existingGroup = _.find(existingGroups, { name: group.name });
  if (existingGroup) {
    return Promise.resolve(true);
  }

  const payload = {
    name: group.name,
    description: `The '${group.name}' Group`
  };

  return request.post({ uri: process.env.AUTHZ_API_URL + '/groups', json: payload, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then((createdGroup) => {
      existingGroups.push(createdGroup);
      log(chalk.green.bold('Group:'), `Created ${group.name}`);
      return group;
    });
}

/*
 * Create add nested groups to a group.
 */
function createNestedGroups(accessToken, existingGroups, group) {
  if (!group.nested || group.nested.length == 0) {
    return Promise.resolve();
  }

  const existingGroup = _.find(existingGroups, { name: group.name });
  const payload = group.nested.map(nestedGroupName => {
    const nestedGroup = _.find(existingGroups, { name: nestedGroupName });
    return nestedGroup._id;
  });

  return request.patch({ uri: process.env.AUTHZ_API_URL + '/groups/' + existingGroup._id + '/nested', json: payload, headers: { 'Authorization': 'Bearer ' + accessToken } })
    .then(() => {
      log(chalk.green.bold('Nested Group:'), `Added ${group.nested.join(', ')} to ${group.name}`);
      return Promise.resolve(true);
    });
}
