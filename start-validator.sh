#!/bin/sh

NODE=$1
GETH_PATH=$2
NODENB=$(echo ${NODE} | cut -d '-' -f2)
PORT=$((30300 + $(echo ${NODE} | cut -d '-' -f2)))
WS=$((32000 + $(echo ${NODE} | cut -d '-' -f2)))
HTTP=$((22000 + $(echo ${NODE} | cut -d '-' -f2)))
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
network_path=${parent_path}/QBFT-Network
validator_path=validator${NODENB}
# GETH=${parent_path}/quorum-old/build/bin/geth
GETH=${parent_path}/${GETH_PATH}/build/bin/geth
PRIVATE_CONFIG=ignore
echo ${validator_path}

cd ${network_path}/artifacts/goQuorum
cp static-nodes.json genesis.json ../../${NODE}/data/

cd ../${validator_path}
cp nodekey* address ../../${NODE}/data
cp account* ../../${NODE}/data/keystore

cd ../../${NODE}
${GETH} --datadir data init data/genesis.json

cd ${network_path}/${NODE}
ADDRESS=$(grep -o '"address": *"[^"]*"' ./data/keystore/accountKeystore | grep -o '"[^"]*"$' | sed 's/"//g')

echo ${PORT}

${GETH} --datadir ${parent_path}/QBFT-Network/${NODE}/data \
    --networkid 1337 --nodiscover --verbosity 5 \
    --syncmode full \
    --istanbul.blockperiod 5 --mine --miner.threads 1 --miner.gasprice 0 --emitcheckpoints \
    --http --http.addr 127.0.0.1 --http.port ${HTTP} --http.corsdomain "*" --http.vhosts "*" \
    --ws --ws.addr 127.0.0.1 --ws.port ${WS} --ws.origins "*" \
    --http.api admin,eth,debug,miner,net,txpool,personal,web3,istanbul \
    --http.corsdomain "*" --ws.api admin,eth,debug,miner,net,txpool,personal,web3,istanbul \
    --unlock ${ADDRESS} --allow-insecure-unlock --password ./data/keystore/accountPassword \
    --port ${PORT}