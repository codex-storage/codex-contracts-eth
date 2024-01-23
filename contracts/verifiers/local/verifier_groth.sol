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
library Pairing {
  // The prime q in the base field F_q for G1
  uint constant private q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
  struct G1Point {
    uint X;
    uint Y;
  }
  // Encoding of field elements is: X[0] * z + X[1]
  struct G2Point {
    uint[2] X;
    uint[2] Y;
  }
  /// The negation of p, i.e. p.addition(p.negate()) should be zero.
  function negate(G1Point memory p) internal pure returns (G1Point memory) {
    if (p.X == 0 && p.Y == 0)
      return G1Point(0, 0);
    return G1Point(p.X, q - (p.Y % q));
  }
  /// The sum of two points of G1
  function addition(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
    uint[4] memory input;
    input[0] = p1.X;
    input[1] = p1.Y;
    input[2] = p2.X;
    input[3] = p2.Y;
    bool success;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
      // Use "invalid" to make gas estimation work
      switch success case 0 { invalid() }
    }
    require(success,"pairing-add-failed");
  }
  /// The product of a point on G1 and a scalar, i.e.
  /// p == p.scalar_mul(1) and p.addition(p) == p.scalar_mul(2) for all points p.
  function scalar_mul(G1Point memory p, uint s) internal view returns (G1Point memory r) {
    uint[3] memory input;
    input[0] = p.X;
    input[1] = p.Y;
    input[2] = s;
    bool success;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
      // Use "invalid" to make gas estimation work
      switch success case 0 { invalid() }
    }
    require (success,"pairing-mul-failed");
  }
  /// The result of computing the pairing check
  /// e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
  /// For example pairing([P1(), P1().negate()], [P2(), P2()]) should
  /// return true.
  function pairing(G1Point[] memory p1, G2Point[] memory p2) internal view returns (bool) {
    require(p1.length == p2.length,"pairing-lengths-failed");
    uint elements = p1.length;
    uint inputSize = elements * 6;
    uint[] memory input = new uint[](inputSize);
    for (uint i = 0; i < elements; i++)
    {
      input[i * 6 + 0] = p1[i].X;
      input[i * 6 + 1] = p1[i].Y;
      input[i * 6 + 2] = p2[i].X[0];
      input[i * 6 + 3] = p2[i].X[1];
      input[i * 6 + 4] = p2[i].Y[0];
      input[i * 6 + 5] = p2[i].Y[1];
    }
    uint[1] memory out;
    bool success;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      success := staticcall(sub(gas(), 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
      // Use "invalid" to make gas estimation work
      switch success case 0 { invalid() }
    }
    require(success,"pairing-opcode-failed");
    return out[0] != 0;
  }
  /// Convenience method for a pairing check for two pairs.
  function pairingProd2(G1Point memory a1, G2Point memory a2, G1Point memory b1, G2Point memory b2) internal view returns (bool) {
    G1Point[] memory p1 = new G1Point[](2);
    G2Point[] memory p2 = new G2Point[](2);
    p1[0] = a1;
    p1[1] = b1;
    p2[0] = a2;
    p2[1] = b2;
    return pairing(p1, p2);
  }
  /// Convenience method for a pairing check for three pairs.
  function pairingProd3(
      G1Point memory a1, G2Point memory a2,
      G1Point memory b1, G2Point memory b2,
      G1Point memory c1, G2Point memory c2
  ) internal view returns (bool) {
    G1Point[] memory p1 = new G1Point[](3);
    G2Point[] memory p2 = new G2Point[](3);
    p1[0] = a1;
    p1[1] = b1;
    p1[2] = c1;
    p2[0] = a2;
    p2[1] = b2;
    p2[2] = c2;
    return pairing(p1, p2);
  }
  /// Convenience method for a pairing check for four pairs.
  function pairingProd4(
      G1Point memory a1, G2Point memory a2,
      G1Point memory b1, G2Point memory b2,
      G1Point memory c1, G2Point memory c2,
      G1Point memory d1, G2Point memory d2
  ) internal view returns (bool) {
    G1Point[] memory p1 = new G1Point[](4);
    G2Point[] memory p2 = new G2Point[](4);
    p1[0] = a1;
    p1[1] = b1;
    p1[2] = c1;
    p1[3] = d1;
    p2[0] = a2;
    p2[1] = b2;
    p2[2] = c2;
    p2[3] = d2;
    return pairing(p1, p2);
  }
}
contract Verifier {
  using Pairing for *;
  uint256 constant private snark_scalar_field = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
  VerifyingKey private verifyingKey;
  struct VerifyingKey {
    Pairing.G1Point alpha1;
    Pairing.G2Point beta2;
    Pairing.G2Point gamma2;
    Pairing.G2Point delta2;
    Pairing.G1Point[] IC;
  }
  struct Proof {
    Pairing.G1Point A;
    Pairing.G2Point B;
    Pairing.G1Point C;
  }
  constructor() {
    verifyingKey.alpha1 = Pairing.G1Point(20491192805390485299153009773594534940189261866228447918068658471970481763042, 9383485363053290200918347156157836566562967994039712273449902621266178545958);
    verifyingKey.beta2 = Pairing.G2Point([4252822878758300859123897981450591353533073413197771768651442665752259397132,6375614351688725206403948262868962793625744043794305715222011528459656738731], [21847035105528745403288232691147584728191162732299865338377159692350059136679,10505242626370262277552901082094356697409835680220590971873171140371331206856]);
    verifyingKey.gamma2 = Pairing.G2Point([11559732032986387107991004021392285783925812861821192530917403151452391805634,10857046999023057135944570762232829481370756359578518086990519993285655852781], [4082367875863433681332203403145435568316851327593401208105741076214120093531,8495653923123431417604973247489272438418190587263600148770280649306958101930]);
    verifyingKey.delta2 = Pairing.G2Point([16947967852917776612242666765339055140004530219040719566241973405926209896589,9526465944650138768726332063321262597514193803543146241262920033512923206833], [8391255886665123549932056926338579244742743577262957977406729945277596579696,19350668523204772149977938696677933779621485674406066708436704188235339847628]);
    verifyingKey.IC.push(Pairing.G1Point(2685717341061384289974985759706305556965509240536260442727245444252129889599, 21827535600902499280458695057256182457185285685995970634461174274051979800815));
    verifyingKey.IC.push(Pairing.G1Point(13158415194355348546090070151711085027834066488127676886518524272551654481129, 18831701962118195025265682681702066674741422770850028135520336928884612556978));
    verifyingKey.IC.push(Pairing.G1Point(20882269691461568155321689204947751047717828445545223718893788782534717197527, 11996193054822748526485644723594571195813487505803351159052936325857690315211));
    verifyingKey.IC.push(Pairing.G1Point(18155166643053044822201627105588517913195535693446564472247126736722594445000, 13816319482622393060406816684195314200198627617641073470088058848129378231754));
  }
  function verify(uint[] memory input, Proof memory proof) internal view returns (uint) {
    require(input.length + 1 == verifyingKey.IC.length,"verifier-bad-input");
    // Compute the linear combination vk_x
    Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);
    for (uint i = 0; i < input.length; i++) {
      require(input[i] < snark_scalar_field,"verifier-gte-snark-scalar-field");
      vk_x = Pairing.addition(vk_x, Pairing.scalar_mul(verifyingKey.IC[i + 1], input[i]));
    }
    vk_x = Pairing.addition(vk_x, verifyingKey.IC[0]);
    if (!Pairing.pairingProd4(
      Pairing.negate(proof.A), proof.B,
      verifyingKey.alpha1, verifyingKey.beta2,
      vk_x, verifyingKey.gamma2,
      proof.C, verifyingKey.delta2
    )) return 1;
    return 0;
  }
  function verifyProof(
      uint[2] memory a,
      uint[2][2] memory b,
      uint[2] memory c,
      uint[3] memory input
    ) public view returns (bool r) {
    Proof memory proof;
    proof.A = Pairing.G1Point(a[0], a[1]);
    proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
    proof.C = Pairing.G1Point(c[0], c[1]);
    uint[] memory inputValues = new uint[](input.length);
    for(uint i = 0; i < input.length; i++){
      inputValues[i] = input[i];
    }
    if (verify(inputValues, proof) == 0) {
      return true;
    } else {
      return false;
    }
  }
}