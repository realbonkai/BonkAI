const { ethers } = require("hardhat");

async function main() {
  //Setting contract addresses

  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const feeReceiver = "0xdc28630221B2d58B8E249Df6d96c928f57bed952";

  const MyAdManager = await ethers.getContractFactory("AdManager");
  const MyAdManagerDeployment = await MyAdManager.deploy(feeReceiver);

  console.log("AdManager address:", MyAdManagerDeployment.target);
  const adManagerAddress = MyAdManagerDeployment.target;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
