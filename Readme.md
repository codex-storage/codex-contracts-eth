Codex Contracts
================

An experimental implementation of the smart contracts that underlay the Codex
storage network. Its goal is to experiment with the rules around the bidding
process, the storage contracts, the storage proofs and the host collateral.
Neither completeness nor correctness are guaranteed at this moment in time.

Running
-------

To run the tests, execute the following commands:

    npm install
    npm test

You can also run fuzzing tests (using [Echidna][echidna]) on the contracts:

    npm run fuzz

To start a local Ethereum node with the contracts deployed, execute:

    npm start

This will create a `deployment-localhost.json` file containing the addresses of
the deployed contracts.

To deploy the marketplace you can define `HARDHAT_NETWORK` and run the following command:

```bash
npm run deploy
# Example
# HARDHAT_NETWORK=localhost npm run deploy
```

Or you can you `npx` directly:

```bash
npx hardhat ignition deploy ignition/modules/marketplace.js --network localhost
```

To reuse a previously deployed `Token` contract, define the environment variable `TOKEN_ADDRESS`.
The deployment script will use `contractAt` from Hardhat Ignition to retrieve the existing contract
instead of deploying a new one.

Deployment
----------

To deploy the marketplace you need to define `HARDHAT_NETWORK`:

```bash
HARDHAT_NETWORK=localhost npm run deploy
```

Or you can you `npx` directly:

```bash
npx hardhat ignition deploy ignition/modules/marketplace.js --network localhost
```

Hardhat uses [reconciliation](https://hardhat.org/ignition/docs/advanced/reconciliation) to recover  
from errors or resume a previous deployment.
In our case, we will likely redeploy a new contract every time, so we will need to
[clear the previous deployment](https://hardhat.org/ignition/docs/guides/modifications#clearing-an-existing-deployment-with-reset):

```bash
HARDHAT_NETWORK=localhost npm run deploy:reset
```

Or you can you `npx` directly:

```bash
npx hardhat ignition deploy ignition/modules/marketplace.js --network localhost --reset
```

To reuse a previously deployed `Token` contract, define the environment variable `TOKEN_ADDRESS`.
The deployment script will use `contractAt` from Hardhat Ignition to retrieve the existing contract
instead of deploying a new one.

The deployment files are kept under version control [as recommended by Hardhat](https://hardhat.org/ignition/docs/advanced/versioning),  
except the build files, which are 18 MB.

Running the prover
------------------

To run the formal verification rules using Certora, first, make sure you have Java (JDK >= 11.0) installed on your machine, and then  install the Certora CLI

```
$ pip install certora-cli
```

Once that is done the `certoraRun` command can be used to send CVL specs to the prover.

You can run Certora's specs with the provided `npm` script:

    npm run verify


Overview
--------

The Codex storage network depends on hosts offering storage to clients of the
network. The smart contracts in this repository handle interactions between
client and hosts as they negotiate and fulfill a contract to store data for a
certain amount of time.

When all goes well, the client and hosts perform the following steps:

    Client                 Host          Marketplace Contract
      |                     |                      |
      |                                            |
      | --------------- request (1) -------------> |
      |                                            |
      | ----- data (2) ---> |                      |
      |                     |                      |
                            | ----- fill (3) ----> |
                            |                      |
                            | ---- proof (4) ----> |
                            |                      |
                            | ---- proof (4) ----> |
                            |                      |
                            | ---- proof (4) ----> |
                            |                      |
                            | <-- payment (5) ---- |

  1. Client submits a request for storage, containing the size of the data that
     it wants to store and the length of time it wants to store it
  2. Client makes the data available to hosts
  3. Hosts submit storage proofs to fill slots in the contract
  4. While the storage contract is active, host prove that they are still
     storing the data by responding to frequent random challenges
  5. At the end of the contract the hosts are paid

Contracts
---------

A storage contract contains of a number of slots. Each of these slots represents
an agreement with a storage host to store a part of the data. Hosts that want to
offer storage can fill a slot in the contract.

A contract can be negotiated through requests. A request contains the size of
the data, the length of time during which it needs to be stored, and a number of
slots. It also contains the reward that a client is willing to pay and proof
requirements such as how often a proof will need to be submitted by hosts. A
random nonce is included to ensure uniqueness among similar requests.

When a new storage contract is created the client immediately pays the entire
price of the contract. The payment is only released to the host upon successful
completion of the contract.

Collateral
----------

To motivate a host to remain honest, it must put up some collateral before it is
allowed to participate in storage contracts. The collateral may not be withdrawn
as long as a host is participating in an active storage contract.

Should a host be misbehaving, then its collateral may be reduced by a certain
percentage (slashed).

Proofs
------

Hosts are required to submit frequent proofs while a contract is active. These
proofs ensure with a high probability that hosts are still holding on to the
data that they were entrusted with.

To ensure that hosts are not able to predict and precalculate proofs, these
proofs are based on a random challenge. Currently we use ethereum block hashes
to determine two things: 1) whether or not a proof is required at this point in
time, and 2) the random challenge for the proof. Although hosts will not be able
to predict the exact times at which proofs are required, the frequency of proofs
averages out to a value that was set by the client in the request for storage.

Hosts have a small period of time in which they are expected to submit a proof.
When that time has expired without seeing a proof, validators are able to point
out the lack of proof. If a host misses too many proofs, it results into a
slashing of its collateral.

References
----------

   * [A marketplace for storage
     durability](https://github.com/codex-storage/codex-research/blob/master/design/marketplace.md)
     (design document)
   * [Timing of Storage
     Proofs](https://github.com/codex-storage/codex-research/blob/master/design/storage-proof-timing.md)
     (design document)

To Do
-----

  * Contract repair

    Allow another host to take over a slot in the contract when the original
    host missed too many proofs.

  * Reward validators

    A validator that points out missed proofs should be compensated for its
    vigilance and for the gas costs of invoking the smart contract.

  * Analysis and optimization of gas usage

[echidna]: https://github.com/crytic/echidna
