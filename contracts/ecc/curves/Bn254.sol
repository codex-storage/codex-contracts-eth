// SPDX-License-Identifier: MIT
//
// From: https://github.com/HarryR/solcrypto/blob/master/contracts/altbn128.sol

pragma solidity >=0.7.0 <=0.8.13;

import "../Types.sol";
import "../vendor/witnet/elliptic-curve-solidity/contracts/EllipticCurve.sol";
import "../vendor/witnet/bls-solidity/contracts/BN256G1.sol";
import "../vendor/witnet/bls-solidity/contracts/BN256G2.sol";

library Bn254 {

  /// @return the generator of G1
  function _p1Generator() internal pure returns (Types.G1Point memory) {
    return Types.G1Point(1, 2);
  }

  /// @return the generator of G2
  function _p2Generator() internal pure returns (Types.G2Point memory) {
    return
      Types.G2Point(
        [
          11559732032986387107991004021392285783925812861821192530917403151452391805634,
          10857046999023057135944570762232829481370756359578518086990519993285655852781
        ],
        [
          4082367875863433681332203403145435568316851327593401208105741076214120093531,
          8495653923123431417604973247489272438418190587263600148770280649306958101930
        ]
      );
  }

  /// @dev  computes P + Q
  /// @param p: G1 point p
  /// @param q: G1 point q
  /// @return G1 point with x and y coordinates of P+Q.
  function _add(Types.G1Point memory p, Types.G1Point memory q)
    internal
    returns (Types.G1Point memory)
  {
    (uint256 x, uint256 y) = BN256G1._add([p.x, p.y, q.x, q.y]);
    return Types.G1Point(x, y);
  }

  /// @dev  computes P*k.
  /// @param p: G1 point p
  /// @param k: scalar k.
  /// @return G1 point with x and y coordinates of P*k.
  function _multiply(Types.G1Point memory p, uint256 k)
    internal
    returns (Types.G1Point memory)
  {
    (uint256 x, uint256 y) = BN256G1._multiply([p.x, p.y, k]);
    return Types.G1Point(x, y);
  }


  /// @dev Check whether point (x,y) is on curve BN254.
  /// @param p1 G1 point
  /// @return true if x,y in the curve, false else
  function _isOnCurve(Types.G1Point memory p1)
    internal
    pure
    returns (bool)
  {
    return BN256G1._isOnCurve([p1.x, p1.y]);
  }
  /**
  * @notice Checks if FQ2 is on G2
  * @param p1 G2 Point
  * @return True if the FQ2 is on G2
  */
  function _isOnCurve(Types.G2Point memory p1)
    internal
    pure
    returns (bool)
  {
    return BN256G2._isOnCurve(p1.x[0], p1.y[0], p1.x[1], p1.y[1]);
  }

  /// @dev Derives the y coordinate from a compressed-format point x [[SEC-1]](https://www.secg.org/SEC1-Ver-1.0.pdf).
  /// @param prefix parity byte (0x02 even, 0x03 odd)
  /// @param x coordinate x
  /// @return y coordinate y
  function _deriveY(uint8 prefix, uint256 x)
    internal
    pure
    returns (uint256)
  {
    return BN256G1._deriveY(prefix, x);
  }

  /// @dev Calculate inverse (x, -y) of point (x, y).
  /// @param p1 G1 point
  /// @return (x, -y)
  function _negate(Types.G1Point memory p1)
    internal
    pure
    returns (Types.G1Point memory)
  {
    (uint256 x, uint256 y) = EllipticCurve.ecInv(p1.x, p1.y, BN256G1.PP);
    return Types.G1Point(x, y);
  }

  /// @dev Substract two points (x1, y1) and (x2, y2) in affine coordinates.
  /// @param p1 G1 point P1
  /// @param p2 G1 point P2
  /// @return (qx, qy) = P1-P2 in affine coordinates
  function _subtract(Types.G1Point memory p1, Types.G1Point memory p2)
    internal
    pure
    returns(Types.G1Point memory)
  {
    (uint256 x, uint256 y) =  EllipticCurve.ecSub(
      p1.x,
      p1.y,
      p2.x,
      p2.y,
      BN256G1.AA,
      BN256G1.PP);

    return Types.G1Point(x, y);
  }

  /// @dev Function to convert a `Hash(msg|DATA)` to a point in the curve as defined in [VRF-draft-04](https://tools.ietf.org/pdf/draft-irtf-cfrg-vrf-04).
  /// @param _message The message used for computing the VRF
  /// @return The hash point in affine coordinates
  function _hashToPoint(bytes memory _message)
    internal
    pure
    returns (Types.G1Point memory)
  {
    (uint256 x, uint256 y) = BN256G1._hashToTryAndIncrement(_message);
    return Types.G1Point(x, y);
  }

  /// @dev Checks if e(P, Q) = e (R,S).
  /// @param p: G1 point P
  /// @param q: G2 point Q
  /// @param r: G1 point R
  /// @param s: G2 point S
  /// @return true if e(P, Q) = e (R,S).
  function _checkPairing(
    Types.G1Point memory p,
    Types.G2Point memory q,
    Types.G1Point memory r,
    Types.G2Point memory s
  )
    internal
    returns (bool)
  {
    return BN256G1._bn256CheckPairing(
      [
        p.x,    // x-coordinate of point P
        p.y,    // y-coordinate of point P
        q.x[0], // x real coordinate of point Q
        q.x[1], // x imaginary coordinate of point Q
        q.y[0], // y real coordinate of point Q
        q.y[1], // y imaginary coordinate of point Q
        r.x,    // x-coordinate of point R
        r.y,    // y-coordinate of point R
        s.x[0], // x real coordinate of point S
        s.x[1], // x imaginary coordinate of point S
        s.y[0], // y real coordinate of point S
        s.y[1]    // y imaginary coordinate of point S
      ]
    );
  }

  function _verifyProof(Types.Proof memory proof) internal returns (bool) {
    require(_isOnCurve(proof.sigma), "proof generated incorrectly");
    require(_isOnCurve(proof.publicKey), "proof keys generated incorrectly");
    require(proof.name.length > 0, "proof name must be provided");
    // var first: blst_p1
    // for qelem in q :
    //   var prod: blst_p1
    //   prod.blst_p1_mult(hashNameI(tau.t.name, qelem.I), qelem.V, 255)
    //   first.blst_p1_add_or_double(first, prod)
    //   doAssert(blst_p1_on_curve(first).bool)
    Types.G1Point memory first;
    for (uint256 i = 0; i<proof.q.length; i++) {
      Types.QElement memory qelem = proof.q[i];
      bytes32 namei = sha256(abi.encodePacked(proof.name, qelem.i));
      // Step 4: arbitraty string to point and check if it is on curve
      // uint256 hPointX = abi.encodePacked(namei);
      Types.G1Point memory h = _hashToPoint(abi.encodePacked(namei));
      // TODO: Where does 255 get used???
      Types.G1Point memory prod = _multiply(h, qelem.v);
      first = _add(first, prod);
      require(_isOnCurve(first), "must be on Bn254 curve");
    }
    // let us = tau.t.u
    // var second: blst_p1
    // for j in 0 ..< len(us) :
    //   var prod: blst_p1
    //   prod.blst_p1_mult(us[j], mus[j], 255)
    //   second.blst_p1_add_or_double(second, prod)
    //   doAssert(blst_p1_on_curve(second).bool)
    Types.G1Point[] memory us = proof.u;
    Types.G1Point memory second;
    for (uint256 j = 0; j<us.length; j++) {
      require(_isOnCurve(us[j]), "incorrect proof setup");
      // TODO: Where does 255 get used???
      Types.G1Point memory prod = _multiply(us[j], proof.mus[j]);
      second = _add(second, prod);
      require(_isOnCurve(second), "must be on Bn254 curve");
    }

    // var sum: blst_p1
    // sum.blst_p1_add_or_double(first, second)
    Types.G1Point memory sum = _add(first, second);

    // var g{.noInit.}: blst_p2
    // g.blst_p2_from_affine(BLS12_381_G2)
    // TODO: do we need to convert Bn254._p2Generator() to/from affine???

    // return verifyPairings(sum, spk.key, sigma, g)
    return Bn254._checkPairing(sum, proof.publicKey, proof.sigma, Bn254._p2Generator());

  }
}
