# Deployment

Hardhat Ignition is now used to deploy the contracts, so the old
deployment files are no longer relevant.

However, the ABI of the contracts has changed due to an OpenZeppelin update.
If we ever need to recreate the artifacts from the previous ABI contracts (for any reason),
we can do so using a small script that imports the previously generated files.
Here is an example:

```js
module.exports = buildModule("Token", (m) => {
  const previousJsonFile = path.join(__dirname, "./TestToken.json");
  const artifact = JSON.parse(fs.readFileSync(previousJsonFile, "utf8"));
  const address = artifact.address;
  const token = m.contractAt("TestToken", address, {});
  return { token };
});
```

Then we can run:

```bash
npx hardhat ignition deploy ignition/modules/migration/token.js --network taiko_test
```

**Note:** Check [this comment](https://github.com/codex-storage/codex-contracts-eth/pull/231#issuecomment-2808996517) for more context.

Here is the list of previous commits containing the ABI contracts that were deployed:

- [Taiko](https://github.com/codex-storage/codex-contracts-eth/commit/1854dfba9991a25532de5f6a53cf50e66afb3c8b)
- [Testnet](https://github.com/codex-storage/codex-contracts-eth/commit/449d64ffc0dc1478d0690d36f037358084a17b09)
- [Linea](https://github.com/codex-storage/codex-contracts-eth/pull/226/commits/2dddc260152b6e9c24ae372397f9b9b2d27ce8e4)
