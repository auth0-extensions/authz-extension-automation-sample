# Authorization Extension Provisioning Tool

This sample tool shows how you can provision groups, roles and permissions in the Authorization Extension using the API.

## Configuring the Extension

In the extension go to the **API** section and enable API access:

![](/screenshots/configure-extension.png)

After saving this page an API (Resource Server) will be created in your Auth0 account.

## Configuring Auth0

Go to your Auth0 account and create a non-interactive client. Authorize it for the Authorization Extension API and give it the following scopes:

  - `read/edit/create:permissions`
  - `read/edit/create:roles`
  - `read/edit/create:groups`

![](/screenshots/configure-account.png)

Also create 2 normal clients and give them a name like "Timesheet App" and "Expenses App". In the `data.json` file, search for `timesheet-app-id` and `expense-app-id` and replace these with the Client IDs of your clients.

## Configure the Provisioning Tool

Update the `.env` file with these settings:

```
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=client-id-of-your-non-interactive-client
AUTH0_CLIENT_SECRET=client-secret-of-your-non-interactive-client
AUTHZ_API_URL=https://url-of-the-extension-api-which-you-see-on-the-api-tab/api
```

## Run

Now run the tool:

```
yarn install
node index
```

![](/screenshots/run-tool.png)

Go back to your extension and you'll see that it's filled with data.
