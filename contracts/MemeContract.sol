// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MemeContract {
    address public owner;
    address public feeReceiver;
    uint256 public viewRate = 0.00001 ether; // 0.1$ per view (in ETH)
    uint256 public clickRate = 0.0005 ether; // 5$ per click (in ETH)
    uint256 public minViews = 1000;
    uint256 public minClicks = 50;

    struct WebsiteOwner {
        address wallet;
        string websiteUrl;
        uint256 balance; // Rewards balance
    }

    mapping(address => WebsiteOwner) public websiteOwners; // Mapping of owner wallet to their details
    address[] public ownerAddresses; // List of website owner addresses

    event AdPaid(address indexed user, uint256 views, uint256 clicks, uint256 amount);
    event RewardsClaimed(address indexed owner, uint256 amount);
    event WebsiteOwnerAdded(address indexed wallet, string websiteUrl);
    event WebsiteOwnerRemoved(address indexed wallet);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor(address _feeReceiver) {
        owner = msg.sender;
        feeReceiver = _feeReceiver;
    }

    function setRates(uint256 _viewRate, uint256 _clickRate) external onlyOwner {
        viewRate = _viewRate;
        clickRate = _clickRate;
    }

    function setMinimums(uint256 _minViews, uint256 _minClicks) external onlyOwner {
        minViews = _minViews;
        minClicks = _minClicks;
    }

    function addWebsiteOwner(address _wallet, string calldata _websiteUrl) external onlyOwner {
        require(_wallet != address(0), "Invalid wallet address");
        require(bytes(_websiteUrl).length > 0, "Website URL cannot be empty");
        require(websiteOwners[_wallet].wallet == address(0), "Owner already exists");

        websiteOwners[_wallet] = WebsiteOwner({
            wallet: _wallet,
            websiteUrl: _websiteUrl,
            balance: 0
        });

        ownerAddresses.push(_wallet);
        emit WebsiteOwnerAdded(_wallet, _websiteUrl);
    }

    function removeWebsiteOwner(address _wallet) external onlyOwner {
        require(websiteOwners[_wallet].wallet != address(0), "Owner does not exist");

        delete websiteOwners[_wallet];

        // Remove from ownerAddresses array
        for (uint256 i = 0; i < ownerAddresses.length; i++) {
            if (ownerAddresses[i] == _wallet) {
                ownerAddresses[i] = ownerAddresses[ownerAddresses.length - 1];
                ownerAddresses.pop();
                break;
            }
        }

        emit WebsiteOwnerRemoved(_wallet);
    }

    function payForAd(uint256 views, uint256 clicks) external payable {
    require(views >= minViews, "Minimum views not met");
    require(clicks >= minClicks, "Minimum clicks not met");

    uint256 totalCost = (views * viewRate) + (clicks * clickRate);
    require(msg.value >= totalCost, "Insufficient payment");

    // Calculate 30% fee
    uint256 fee = (totalCost * 30) / 100;

    // Send the fee to the designated wallet
    address designatedWallet = feeReceiver; // Replace with the actual designated wallet address
    (bool feeSuccess, ) = payable(designatedWallet).call{value: fee}("");
    require(feeSuccess, "Fee transfer failed");

    /* // Calculate the remaining amount to distribute
    uint256 remainingAmount = totalCost - fee;

    // Distribute the remaining amount to website owners
    require(ownerAddresses.length > 0, "No website owners registered");
    uint256 revenuePerOwner = remainingAmount / ownerAddresses.length;

    for (uint256 i = 0; i < ownerAddresses.length; i++) {
        websiteOwners[ownerAddresses[i]].balance += revenuePerOwner;
    } */

    emit AdPaid(msg.sender, views, clicks, msg.value);
}


    function batchUpdateRewards(address[] calldata owners, uint256[] calldata rewards) external onlyOwner {
    require(owners.length == rewards.length, "Mismatched array lengths");

    for (uint256 i = 0; i < owners.length; i++) {
        address _owner = owners[i];
        uint256 reward = rewards[i];

        require(_owner != address(0), "Invalid owner address");
        require(reward > 0, "Reward must be greater than 0");

        websiteOwners[_owner].balance += reward;
    }
}


    function claimRewards(uint256 claimableAmount) external {
    require(claimableAmount > 0, "Claimable amount must be greater than zero");

    // Check if the contract has enough balance
    require(address(this).balance >= claimableAmount, "Insufficient contract balance");

    (bool success, ) = payable(msg.sender).call{value: claimableAmount}("");
    require(success, "Transfer failed");

    emit RewardsClaimed(msg.sender, claimableAmount);
}


    function batchDistributeRewards(address[] calldata owners, uint256[] calldata amounts) external onlyOwner {
    require(owners.length == amounts.length, "Mismatched array lengths");

    for (uint256 i = 0; i < owners.length; i++) {
        address _owner = owners[i];
        uint256 amount = amounts[i];

        require(_owner != address(0), "Invalid owner address");
        require(amount > 0, "Amount must be greater than 0");

        (bool success, ) = payable(_owner).call{value: amount}("");
        require(success, "Transfer failed");
    }
}


    function getClaimableAmount(address _owner) external view returns (uint256) {
        return websiteOwners[_owner].balance;
    }

    // Fallback function to accept ETH
    receive() external payable {}
}
