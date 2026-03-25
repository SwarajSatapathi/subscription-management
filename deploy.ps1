$ErrorActionPreference = "Stop"
$soroban = "$env:USERPROFILE\.cargo\bin\stellar.exe"

Write-Host "Generating Identity Alice..."
& $soroban keys generate alice --network testnet 2>$null

Write-Host "Deploying to Testnet..."
$contract_id = & $soroban contract deploy --wasm target\wasm32-unknown-unknown\release\subscription.wasm --source alice --network testnet

Write-Host "DEPLOY_SUCCESS=$contract_id"
