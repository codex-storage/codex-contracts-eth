// Copyright 2017 Christian Reitwiessner
// Copyright 2019 OKIMS
// Copyright 2024 Codex
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;
import "./Groth16.sol";

library Pairing {
  // The prime q in the base field F_q for G1
  uint private constant _Q =
    21888242871839275222246405745257275088696311157297823662689037894645226208583;

  /// The negation of p, i.e. p.addition(p.negate()) should be zero.
  function negate(G1Point memory p) internal pure returns (G1Point memory) {
    return G1Point(p.x, (_Q - p.y) % _Q);
  }

  /// The sum of two points of G1
  function add(
    G1Point memory p1,
    G1Point memory p2
  ) internal view returns (bool success, G1Point memory sum) {
    uint[4] memory input;
    input[0] = p1.x;
    input[1] = p1.y;
    input[2] = p2.x;
    input[3] = p2.y;
    // solhint-disable-next-line no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 6, input, 128, sum, 64)
    }
  }

  /// The product of a point on G1 and a scalar, i.e.
  /// p == p.scalarMul(1) and p.addition(p) == p.scalarMul(2) for all points p.
  function multiply(
    G1Point memory p,
    uint s
  ) internal view returns (bool success, G1Point memory product) {
    uint[3] memory input;
    input[0] = p.x;
    input[1] = p.y;
    input[2] = s;
    // solhint-disable-next-line no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 7, input, 96, product, 64)
    }
  }

  function checkPairing(
    G1Point memory a1,
    G2Point memory a2,
    G1Point memory b1,
    G2Point memory b2,
    G1Point memory c1,
    G2Point memory c2,
    G1Point memory d1,
    G2Point memory d2
  ) internal view returns (bool success, uint outcome) {

    uint[24] memory input; // 4 pairs of G1 and G2 points
    uint[1] memory output;

    input[0] = a1.x;
    input[1] = a1.y;
    input[2] = a2.x.imag;
    input[3] = a2.x.real;
    input[4] = a2.y.imag;
    input[5] = a2.y.real;

    input[6] = b1.x;
    input[7] = b1.y;
    input[8] = b2.x.imag;
    input[9] = b2.x.real;
    input[10] = b2.y.imag;
    input[11] = b2.y.real;

    input[12] = c1.x;
    input[13] = c1.y;
    input[14] = c2.x.imag;
    input[15] = c2.x.real;
    input[16] = c2.y.imag;
    input[17] = c2.y.real;

    input[18] = d1.x;
    input[19] = d1.y;
    input[20] = d2.x.imag;
    input[21] = d2.x.real;
    input[22] = d2.y.imag;
    input[23] = d2.y.real;

    // solhint-disable-next-line no-inline-assembly
    assembly {
      success := staticcall(
        sub(gas(), 2000),
        8,
        input,
        768, // 24 uints, 32 bytes each
        output,
        32
      )
    }
    return (success, output[0]);
  }
}

contract Groth16Verifier {
  using Pairing for *;
  uint256 private constant _SNARK_SCALAR_FIELD =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;
  VerifyingKey private _verifyingKey;
  struct VerifyingKey {
    G1Point alpha1;
    G2Point beta2;
    G2Point gamma2;
    G2Point delta2;
    G1Point[] ic;
  }

  constructor(VerifyingKey memory key) {
    _verifyingKey.alpha1 = key.alpha1;
    _verifyingKey.beta2 = key.beta2;
    _verifyingKey.gamma2 = key.gamma2;
    _verifyingKey.delta2 = key.delta2;
    for (uint i = 0; i < key.ic.length; i++) {
      _verifyingKey.ic.push(key.ic[i]);
    }
  }

  function verify(
    Groth16Proof calldata proof,
    uint[] memory input
  ) public view returns (bool success) {
    require(input.length + 1 == _verifyingKey.ic.length, "verifier-bad-input");
    // Compute the linear combination vkX
    G1Point memory vkX = G1Point(0, 0);
    for (uint i = 0; i < input.length; i++) {
      require(
        input[i] < _SNARK_SCALAR_FIELD,
        "verifier-gte-snark-scalar-field"
      );
      G1Point memory product;
      (success, product) = Pairing.multiply(_verifyingKey.ic[i + 1], input[i]);
      if (!success) {
        return false;
      }
      (success, vkX) = Pairing.add(vkX, product);
      if (!success) {
        return false;
      }
    }
    (success, vkX) = Pairing.add(vkX, _verifyingKey.ic[0]);
    if (!success) {
      return false;
    }
    uint outcome;
    (success, outcome) =
      Pairing.checkPairing(
        Pairing.negate(proof.a),
        proof.b,
        _verifyingKey.alpha1,
        _verifyingKey.beta2,
        vkX,
        _verifyingKey.gamma2,
        proof.c,
        _verifyingKey.delta2
      );
    if (!success) {
      return false;
    }
    return outcome == 1;
  }
}
