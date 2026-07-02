# CrickMitra Local HTTP Server
# Runs a lightweight HTTP server using built-in Windows .NET HttpListener.

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8000/")
$listener.Prefixes.Add("http://localhost:8000/")

# Auto-detect local Wi-Fi / LAN IP addresses
$ipAddresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | 
               Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -ne '127.0.0.1' }

$localIps = @()
$wifiEnabled = $false

foreach ($ip in $ipAddresses) {
    $ipStr = $ip.ToString()
    try {
        $listener.Prefixes.Add("http://$ipStr:8000/")
        $localIps += $ipStr
    } catch {
        # Ignore binding errors
    }
}

try {
    $listener.Start()
    $wifiEnabled = $true
} catch {
    # If starting fails (due to lack of Admin rights), recreate listener with loopback prefixes only
    $listener.Close()
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:8000/")
    $listener.Prefixes.Add("http://localhost:8000/")
    
    try {
        $listener.Start()
        $wifiEnabled = $false
    } catch {
        Write-Error "Could not start HTTP listener on port 8000. Please ensure port 8000 is free."
        exit
    }
}

Write-Host "============================================="
Write-Host "CrickMitra local server started successfully!"
Write-Host "============================================="
Write-Host "Local Scorer Link:    http://127.0.0.1:8000/index.html"
Write-Host "Local Stream Overlay: http://127.0.0.1:8000/overlay.html"
Write-Host "Local Stadium Board:  http://127.0.0.1:8000/stadium.html"
Write-Host "---------------------------------------------"

if ($wifiEnabled) {
    Write-Host "[WiFi] Wi-Fi Scorecard Sharing is ENABLED!"
    Write-Host "Open these links on other devices (Phones/Tablets) on the same Wi-Fi:"
    foreach ($ip in $localIps) {
        Write-Host "  -> http://$ip:8000/viewer.html"
    }
} else {
    Write-Host "[Local] Running in Local-Only Mode."
    Write-Host "-> To share live scores on other devices (Phones/Tablets over Wi-Fi):"
    Write-Host "   Please close this window, open PowerShell as ADMINISTRATOR,"
    Write-Host "   and run the command again."
}
Write-Host "============================================="

$globalState = "{}"
$baseDir = "C:\Users\kumbh\.gemini\antigravity\scratch\crickmitra-scoring"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $urlPath = $request.Url.LocalPath

        if ($urlPath -eq "/api/state") {
            if ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $globalState = $reader.ReadToEnd()
                $response.StatusCode = 200
                $response.ContentType = "application/json"
                $statusJson = '{"status":"ok"}'
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($statusJson)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } else {
                $response.StatusCode = 200
                $response.ContentType = "application/json"
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($globalState)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
        } else {
            if ($urlPath -eq "/") { $urlPath = "/index.html" }
            $filePath = Join-Path $baseDir $urlPath
            
            if (Test-Path $filePath -PathType Leaf) {
                $response.StatusCode = 200
                
                $ext = [System.IO.Path]::GetExtension($filePath)
                $contentType = "text/plain"
                if ($ext -eq ".html") { $contentType = "text/html" }
                elseif ($ext -eq ".css") { $contentType = "text/css" }
                elseif ($ext -eq ".js") { $contentType = "text/javascript" }
                elseif ($ext -eq ".png") { $contentType = "image/png" }
                
                $response.ContentType = $contentType
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $buffer = [System.Text.Encoding]::UTF8.GetBytes("File Not Found")
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
