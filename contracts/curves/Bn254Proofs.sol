// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <=0.8.13;

import "./Bn254.sol";

library Bn254Proofs {
  struct QElement {
    int64     i;
    uint256   v;
  }

  struct Proof {
    // TODO: should `q` be bounded?
    QElement[]        q;
    uint256[10]       mus;
    // sigma is probably only the x coordinate
    // (https://github.com/supranational/blst#serialization-format)
    Bn254.G1Point     sigma;
    // TODO: should `u` be bounded?
    Bn254.G1Point[]   u;
    bytes             name;
    Bn254.G2Point     publicKey;
  }

  function verifyProof(Proof memory proof) internal view returns (bool) {
    // var first: blst_p1
    // for qelem in q :
    //   var prod: blst_p1
    //   prod.blst_p1_mult(hashNameI(tau.t.name, qelem.I), qelem.V, 255)
    //   first.blst_p1_add_or_double(first, prod)
    //   doAssert(blst_p1_on_curve(first).bool)
    Bn254.G1Point memory first;
    for (uint256 i = 0; i<proof.q.length; i++) {
      QElement memory qelem = proof.q[i];
      bytes32 namei = sha256(abi.encodePacked(proof.name, qelem.i));
      // Step 4: arbitraty string to point and check if it is on curve
      uint256 hPointX = uint256(namei);
      Bn254.G1Point memory h = Bn254.HashToPoint(hPointX);
      // TODO: Where does 255 get used???
      Bn254.G1Point memory prod = Bn254.g1mul(h, uint256(qelem.v));
      first = Bn254.g1add(first, prod);
      require(Bn254.isOnCurve(first), "must be on Bn254 curve");
    }
    // let us = tau.t.u
    // var second: blst_p1
    // for j in 0 ..< len(us) :
    //   var prod: blst_p1
    //   prod.blst_p1_mult(us[j], mus[j], 255)
    //   second.blst_p1_add_or_double(second, prod)
    //   doAssert(blst_p1_on_curve(second).bool)
    Bn254.G1Point[] memory us = proof.u;
    Bn254.G1Point memory second;
    for (uint256 j = 0; j<us.length; j++) {
      // TODO: Where does 255 get used???
      Bn254.G1Point memory prod = Bn254.g1mul(us[j], proof.mus[j]);
      second = Bn254.g1add(second, prod);
      require(Bn254.isOnCurve(second), "must be on Bn254 curve");
    }

    // var sum: blst_p1
    // sum.blst_p1_add_or_double(first, second)
    Bn254.G1Point memory sum = Bn254.g1add(first, second);

    // var g{.noInit.}: blst_p2
    // g.blst_p2_from_affine(BLS12_381_G2)
    // TODO: do we need to convert Bn254.P2() to/from affine???

    // return verifyPairings(sum, spk.key, sigma, g)
    return Bn254.pairingProd2(sum, proof.publicKey, proof.sigma, Bn254.P2());

  }
}