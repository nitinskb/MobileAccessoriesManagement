# MobileAccessories Desktop & API -- Setup Guide for Another PC

This guide explains how to deploy the **MobileAccessories API on a
Windows/IIS server** and install the **Tauri Desktop app on another
Windows PC**.

> **Important:** The current working setup uses
> `https://localhost:5043/api`. That URL works only when the Desktop app
> and API run on the **same computer**. For a separate client PC, use
> the API server's DNS name (recommended) or IP address, with a TLS
> certificate valid for that name. Do not use `localhost` on the client
> PC.

------------------------------------------------------------------------

## 1. Deployment layout

Use these roles:

-   **API Server PC:** Hosts the ASP.NET Core API in IIS and connects to
    SQL Server.
-   **Client PC(s):** Run the installed MobileAccessories Desktop
    application.
-   **SQL Server:** Must be reachable from the API Server PC. The
    desktop app should connect to the API, not directly to SQL Server.

Example values used in this guide (replace them with your actual
values):

  Setting                Example
  ---------------------- -------------------------------------------
  API server DNS name    `shop-api.example.local`
  HTTPS port             `5043`
  API base URL           `https://shop-api.example.local:5043/api`
  IIS website name       `MobileAccessoriesApi`
  IIS application pool   `MobileAccessoriesApiPool`
  Published API folder   `C:\PublishedApps\MobileAccessoriesApi`

Do not copy the example DNS name literally. Use a name that resolves to
your API Server PC on your network.

------------------------------------------------------------------------

## 2. Prepare the API Server PC

### 2.1 Install prerequisites

1.  Install the supported **.NET ASP.NET Core Hosting Bundle** for the
    target framework used by the API.
2.  Install/configure SQL Server and make sure the API Server PC can
    reach it.
3.  Install IIS and the IIS management tools.
4.  Restart IIS after installing the Hosting Bundle:

``` powershell
iisreset
```

Run PowerShell as Administrator.

### 2.2 Publish the API

From the repository root, publish the API project. Adjust the target
framework if the project uses a different one:

``` powershell
dotnet publish ".\src\Server\MobileAccessories.Api\MobileAccessories.Api.csproj" -c Release -o "C:\PublishedApps\MobileAccessoriesApi"
```

Copy the published output to the API server's publish folder if
publishing from a build PC.

### 2.3 Configure the production connection string

In the API server's published `appsettings.Production.json` (or the
configuration source used by your deployment), set the real SQL Server
connection string under `ConnectionStrings:DefaultConnection`.

Example structure only --- replace server, database, and authentication
details with your environment's values:

``` json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR_SQL_SERVER;Database=YOUR_DATABASE;Trusted_Connection=True;TrustServerCertificate=False;"
  }
}
```

Security notes:

-   Do not commit production passwords or secrets to source control.
-   Prefer Windows Authentication or a securely managed SQL login.
-   If using SQL authentication, protect the password and restrict the
    SQL login's permissions.
-   Confirm SQL Server firewall/network access from the API Server PC.
-   Do not expose SQL Server directly to client PCs.

### 2.4 Create or verify the IIS Application Pool

In elevated PowerShell:

``` powershell
Import-Module WebAdministration

Get-WebAppPoolState -Name "MobileAccessoriesApiPool"
```

If the pool does not exist, create it:

``` powershell
New-WebAppPool -Name "MobileAccessoriesApiPool"
Set-ItemProperty "IIS:\AppPools\MobileAccessoriesApiPool" -Name managedRuntimeVersion -Value ""
```

For a typical ASP.NET Core API hosted out-of-process/in-process by the
ASP.NET Core Module, the pool should use **No Managed Code** (empty
`managedRuntimeVersion`).

### 2.5 Create or verify the IIS website

Check whether the site already exists:

``` powershell
Get-Website -Name "MobileAccessoriesApi"
```

If it does not exist, create it:

``` powershell
New-Website `
  -Name "MobileAccessoriesApi" `
  -PhysicalPath "C:\PublishedApps\MobileAccessoriesApi" `
  -ApplicationPool "MobileAccessoriesApiPool" `
  -Port 80
```

If the site already exists, verify its physical path and pool:

``` powershell
Get-Website -Name "MobileAccessoriesApi" |
  Format-List Name,State,Bindings,PhysicalPath,ApplicationPool
```

Grant the application pool identity read/execute access to the publish
folder:

``` powershell
icacls "C:\PublishedApps\MobileAccessoriesApi" /grant "IIS AppPool\MobileAccessoriesApiPool:(OI)(CI)(RX)" /T
```

If the API writes files, grant write permission only to the specific
upload/data folder, not the entire publish directory.

------------------------------------------------------------------------

## 3. Configure HTTPS on the API Server

Production authentication and antiforgery cookies are configured with
`CookieSecurePolicy.Always`. Therefore, the API must be accessed over
HTTPS. Do not change production cookies to insecure HTTP just to make
the app work.

### 3.1 Choose the API server name

For multiple PCs, use a DNS name such as:

``` text
shop-api.example.local
```

Make sure every client PC can resolve that name to the API Server PC.
You can test from a client PC:

``` powershell
Resolve-DnsName shop-api.example.local
```

If your network does not have DNS, configure a stable host name
resolution method with your network administrator. Avoid relying on a
changing IP address.

### 3.2 Obtain a suitable TLS certificate

Obtain a certificate whose Subject Alternative Name (SAN) includes the
exact DNS name clients will use, for example `shop-api.example.local`.

Recommended options:

-   A certificate issued by your organization's trusted internal
    Certificate Authority; or
-   A certificate from a publicly trusted CA when using a public DNS
    name.

The certificate must: - Be valid and not expired. - Include **Server
Authentication** usage. - Have a private key on the API Server PC. -
Match the DNS name used in the API URL. - Be trusted by each client PC.

A `CN=localhost` certificate is only for `localhost`. It is **not**
suitable for other PCs connecting by server name or IP.

### 3.3 Add the HTTPS binding in IIS

First inspect current bindings:

``` powershell
Import-Module WebAdministration
Get-WebBinding -Name "MobileAccessoriesApi" |
  Format-Table protocol,bindingInformation
```

If an HTTPS binding for the selected port and host name already exists,
do not add a duplicate. Otherwise add one. Replace the host name with
your actual API DNS name:

``` powershell
New-WebBinding `
  -Name "MobileAccessoriesApi" `
  -Protocol https `
  -IPAddress "*" `
  -Port 5043 `
  -HostHeader "shop-api.example.local"
```

Find the certificate thumbprint in the Local Computer Personal store:

``` powershell
Get-ChildItem Cert:\LocalMachine\My |
  Format-Table Subject,DnsNameList,Thumbprint,NotAfter -AutoSize
```

Attach the correct certificate. Replace the thumbprint with the real
certificate thumbprint:

``` powershell
$thumbprint = "PASTE_CERTIFICATE_THUMBPRINT_HERE"
$binding = Get-WebBinding -Name "MobileAccessoriesApi" -Protocol https
$binding.AddSslCertificate($thumbprint, "My")
```

If IIS uses SNI/host-name bindings, verify the binding in IIS Manager
and ensure the certificate is assigned to the matching host name. Do not
attach a certificate for a different host.

### 3.4 Open the HTTPS port in Windows Firewall

For port `5043`, run on the API Server PC (Administrator PowerShell):

``` powershell
New-NetFirewallRule `
  -DisplayName "MobileAccessories API HTTPS 5043" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 5043 `
  -Action Allow
```

Only allow access from trusted network profiles/IP ranges where
possible. Do not expose the API publicly unless it is intentionally
secured and managed for internet access.

### 3.5 Test HTTPS on the API Server PC

``` powershell
Test-NetConnection localhost -Port 5043
Invoke-WebRequest "https://localhost:5043/api/auth/csrf" -Method GET
```

For a named certificate, test the actual server DNS name:

``` powershell
Invoke-WebRequest "https://shop-api.example.local:5043/api/auth/csrf" -Method GET
```

Expected result for the CSRF endpoint: **HTTP 200 OK** and JSON
containing `requestToken`.

Do not use `-SkipCertificateCheck` as a production fix. Resolve
certificate trust/name errors instead.

------------------------------------------------------------------------

## 4. Configure CORS and application settings

The API's CORS policy must allow the actual Tauri app origins configured
by the application. In the current project, the defaults include:

-   `tauri://localhost`
-   `http://tauri.localhost`
-   `https://tauri.localhost`

Check the deployed `appsettings.Production.json` and any environment
overrides for `Cors:AllowedOrigins`. Keep only the exact origins
required by the app. Do not use `AllowAnyOrigin()` together with
credentials.

The API's middleware should keep authentication and authorization
enabled. The current app uses:

``` csharp
app.UseHttpsRedirection();
app.UseCors("ClientOrigins");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

The production authentication and antiforgery cookies should remain
Secure (`CookieSecurePolicy.Always`). Do not disable antiforgery
validation to work around deployment problems.

------------------------------------------------------------------------

## 5. Configure the Desktop app for the other PC

In the Desktop project, create/update `.env.production`:

``` env
VITE_API_BASE_URL=https://shop-api.example.local:5043/api
```

Replace `shop-api.example.local` with the actual API server DNS name.

Important:

-   Do **not** use `https://localhost:5043/api` on a different client
    PC. `localhost` always means the computer running the Desktop app.
-   `VITE_API_PROXY_TARGET` is only for the Vite development server. It
    is not needed in `.env.production`.
-   Vite environment variables are embedded at build time. Changing
    `.env.production` after building does not update an existing
    installer.

Build the installer from the Desktop project folder:

``` powershell
npm install
npm run build
npx tauri build
```

Typical installer output location:

``` text
src-tauri\target\release\bundle\
```

Copy the generated MSI/NSIS installer to the client PC and install it.

------------------------------------------------------------------------

## 6. Prepare each client PC

1.  Ensure the client PC can resolve the API server DNS name.
2.  Ensure the API server's HTTPS certificate chain is trusted on the
    client PC. For an internal CA, install the organization's CA
    certificate in the appropriate Trusted Root store using your
    IT/security process. Do not distribute the API server's private key.
3.  Test connectivity from the client PC:

``` powershell
Test-NetConnection shop-api.example.local -Port 5043
Invoke-WebRequest "https://shop-api.example.local:5043/api/auth/csrf" -Method GET
```

4.  Install the Desktop app.
5.  Open the app and test login, logout, and a normal authenticated API
    operation.

If the browser/WebView reports a certificate name or trust error,
correct the certificate/DNS/trust configuration. Do not bypass TLS
validation.

------------------------------------------------------------------------

## 7. Troubleshooting

### API server is unreachable

On the API Server PC:

``` powershell
Get-Website -Name "MobileAccessoriesApi"
Get-WebAppPoolState -Name "MobileAccessoriesApiPool"
Get-WebBinding -Name "MobileAccessoriesApi"
Test-NetConnection localhost -Port 5043
```

On the client PC:

``` powershell
Resolve-DnsName shop-api.example.local
Test-NetConnection shop-api.example.local -Port 5043
```

Check Windows Firewall and network routing if TCP connectivity fails.

### `/api/auth/csrf` returns HTTP 500 with SecurePolicy/SSL error

The request is reaching the API over HTTP or HTTPS termination/proxy
forwarding is not configured correctly. Use HTTPS end-to-end or
configure trusted reverse-proxy forwarding correctly. Keep production
Secure cookies enabled.

### HTTP 401

The API is reachable, but the request is unauthenticated or the login
session cookie was not sent/accepted. Check login response, cookie
settings, and whether the app is using the same API host consistently.

### HTTP 403

Check authorization requirements, CSRF token retrieval, and whether the
`X-CSRF-TOKEN` header and antiforgery cookie are both sent on protected
POST requests.

### CORS error

Check the browser console and the exact Tauri origin. Add that exact
origin to `Cors:AllowedOrigins`; keep `AllowCredentials()` and do not
combine credentials with wildcard origins.

### SQL connection error

Check the API server's `ConnectionStrings:DefaultConnection`, SQL Server
service, SQL firewall/network access, and the identity/credentials used
by the API. SQL Server connectivity is from the API Server PC, not from
the Desktop client PC.

### IIS website is stopped

``` powershell
Start-Website -Name "MobileAccessoriesApi"
Start-WebAppPool -Name "MobileAccessoriesApiPool"
```

### Check Windows Application log

Use Event Viewer → Windows Logs → Application. Look for ASP.NET Core
Module, IIS, and `.NET Runtime` errors around the time of the failed
request. Do not share passwords, connection strings, tokens, or private
keys in logs/screenshots.

------------------------------------------------------------------------

## 8. Deployment checklist

### API Server PC

-   [ ] ASP.NET Core Hosting Bundle installed.
-   [ ] API published to `C:\PublishedApps\MobileAccessoriesApi`.
-   [ ] Production SQL connection string configured securely.
-   [ ] IIS website `MobileAccessoriesApi` started.
-   [ ] App pool `MobileAccessoriesApiPool` started and set to No
    Managed Code.
-   [ ] Valid HTTPS certificate installed with private key.
-   [ ] Certificate SAN matches the API DNS name.
-   [ ] HTTPS binding configured on port `5043`.
-   [ ] Firewall permits TCP `5043` from intended client network.
-   [ ] `/api/auth/csrf` returns HTTP 200 over HTTPS.

### Each Desktop client PC

-   [ ] API DNS name resolves to the API Server PC.
-   [ ] API certificate is trusted and name matches.
-   [ ] HTTPS connectivity test succeeds.
-   [ ] Desktop installer built with the correct `.env.production` API
    URL.
-   [ ] Desktop app installed and login tested.

------------------------------------------------------------------------

## 9. Current single-PC setup reference

The original working local setup in this project used:

``` text
IIS site:       MobileAccessoriesApi
App pool:       MobileAccessoriesApiPool
Publish folder: C:\PublishedApps\MobileAccessoriesApi
HTTPS URL:      https://localhost:5043
API base URL:   https://localhost:5043/api
Certificate:   CN=localhost
```

This local-only URL/certificate configuration is not a multi-PC
deployment configuration. For another PC, use a server DNS name and a
matching trusted certificate as described above.

**Security reminder:** Never send the certificate's private key (`.pfx`)
to client PCs. Clients need only to trust the issuing CA/public
certificate chain. Never include database passwords, signing keys, or
production secrets in this README or in source control.
