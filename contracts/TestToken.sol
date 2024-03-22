// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/* The `increaseAllowance` function of OpenZeppelin's ERC20 implementation is
being used, which is not part of the standard ERC20 interface. If the Codex
token must be an ERC20 token (eg DAI), then that token will need to be wrapped in
OpenZeppelin's ERC20Wrapped to ensure that `increaseAllowance` is available.

The reason `increaseAllowance` is needed is because the sales state machine
handles concurrent slot fills, which requires token approval. Because these
approvals happen concurrently, simply calling `approve` is not sufficient as
each `approve` amount will overwrite the previous. As an example, if a single
node attempts to fill two slots simultaneously, it will send two `approve`
transactions followed by two `fillSlot` transactions. The first two `approve`
transactions will each approve the collateral amount for one `fillSlot`, the
second overwriting the first, so the total approved will only ever be enough for
one `fillSlot`. So after the first `fillSlot` is sent, the second one will fail
as not enough tokens will have been approved. The solution is use
`increaseAllowance` instead of `approve` which increases the allowance instead
of overwriting it. */

contract TestToken is ERC20 {
  // solhint-disable-next-line no-empty-blocks
  constructor() ERC20("TestToken", "TST") {}

  function mint(address holder, uint256 amount) public {
    _mint(holder, amount);
  }
}
