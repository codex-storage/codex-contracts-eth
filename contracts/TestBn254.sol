// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <=0.8.13;

import "./ecc/curves/Bn254.sol";
import "./ecc/Types.sol";

contract TestBn254 {
  using Bn254 for *;

  function p1Generator() public pure returns (Types.G1Point memory) {
    return Bn254._p1Generator();
  }

  function p2Generator() public pure returns (Types.G2Point memory) {
    return Bn254._p2Generator();
  }

  function add(Types.G1Point memory p, Types.G1Point memory q)
    public
    returns (Types.G1Point memory)
  {
    return p._add(q);
  }

  function multiply(Types.G1Point memory p, uint256 k)
    public
    returns (Types.G1Point memory)
  {
    return p._multiply(k);
  }

  function negate(Types.G1Point memory p1)
    public
    pure
    returns (Types.G1Point memory)
  {
    return p1._negate();
  }

  function checkPairing(
    Types.G1Point memory p,
    Types.G2Point memory q,
    Types.G1Point memory r,
    Types.G2Point memory s
  )
    public
    returns (bool)
  {
    return p._checkPairing(q, r, s);
  }

  function isOnCurve(Types.G1Point memory p1)
    public
    pure
    returns (bool)
  {
    return p1._isOnCurve();
  }

  function hashToPoint(bytes memory _message)
    public
    pure
    returns (Types.G1Point memory)
  {
    return _message._hashToPoint();
  }

  function verifyProof(Types.Proof memory p) public returns (bool) {
    return p._verifyProof();
  }
}
