#!/bin/sh

parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )

# npm install -g truffle

cd ${parent_path}/truffle

truffle compile

truffle migrate --network live
