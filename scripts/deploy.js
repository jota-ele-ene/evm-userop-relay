import hre from "hardhat";

console.log("hre.viem =", hre.viem);

async function main() {
  console.log("Deploying JsonRegistry...");

  const contract = await hre.viem.deployContract("JsonRegistry");

  console.log("JsonRegistry deployed to:", contract.address);
}

main().catch((error) => {
  console.log("hre keys:", Object.keys(hre));
  console.log("hre.viem:", hre.viem);
  console.error(error);
  process.exitCode = 1;
});