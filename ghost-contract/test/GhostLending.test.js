const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GhostLending", function () {
  let lending, server, lender1, lender2, borrower, other;

  beforeEach(async function () {
    [server, lender1, lender2, borrower, other] = await ethers.getSigners();
    const GhostLending = await ethers.getContractFactory("GhostLending");
    lending = await GhostLending.deploy(server.address);
    await lending.waitForDeployment();
  });

  describe("Deposit/Withdraw Lend", function () {
    it("should deposit lend", async function () {
      await lending.connect(lender1).depositLend({ value: ethers.parseEther("10") });
      expect(await lending.getLenderBalance(lender1.address)).to.equal(ethers.parseEther("10"));
    });

    it("should emit LendDeposited", async function () {
      await expect(lending.connect(lender1).depositLend({ value: ethers.parseEther("5") }))
        .to.emit(lending, "LendDeposited")
        .withArgs(lender1.address, ethers.parseEther("5"));
    });

    it("should revert on zero deposit", async function () {
      await expect(lending.connect(lender1).depositLend({ value: 0 })).to.be.revertedWith("zero amount");
    });

    it("should withdraw lend", async function () {
      await lending.connect(lender1).depositLend({ value: ethers.parseEther("10") });
      await lending.connect(lender1).withdrawLend(ethers.parseEther("5"));
      expect(await lending.getLenderBalance(lender1.address)).to.equal(ethers.parseEther("5"));
    });

    it("should revert withdraw exceeding balance", async function () {
      await lending.connect(lender1).depositLend({ value: ethers.parseEther("1") });
      await expect(lending.connect(lender1).withdrawLend(ethers.parseEther("2"))).to.be.revertedWith("insufficient balance");
    });
  });

  describe("Deposit/Withdraw Collateral", function () {
    it("should deposit collateral", async function () {
      await lending.connect(borrower).depositCollateral({ value: ethers.parseEther("5") });
      expect(await lending.getBorrowerCollateral(borrower.address)).to.equal(ethers.parseEther("5"));
    });

    it("should withdraw collateral", async function () {
      await lending.connect(borrower).depositCollateral({ value: ethers.parseEther("5") });
      await lending.connect(borrower).withdrawCollateral(ethers.parseEther("3"));
      expect(await lending.getBorrowerCollateral(borrower.address)).to.equal(ethers.parseEther("2"));
    });

    it("should revert withdraw exceeding collateral", async function () {
      await expect(lending.connect(borrower).withdrawCollateral(ethers.parseEther("1"))).to.be.revertedWith("insufficient collateral");
    });
  });

  describe("executeLoan", function () {
    beforeEach(async function () {
      // Lenders deposit
      await lending.connect(lender1).depositLend({ value: ethers.parseEther("100") });
      await lending.connect(lender2).depositLend({ value: ethers.parseEther("100") });
      // Borrower deposits collateral (need 150% of 10 = 15 at default 500 score)
      await lending.connect(borrower).depositCollateral({ value: ethers.parseEther("20") });
    });

    it("should execute loan", async function () {
      const borrowerBalBefore = await ethers.provider.getBalance(borrower.address);

      await lending.connect(server).executeLoan(
        borrower.address,
        [lender1.address], [ethers.parseEther("6")],   // senior
        [lender2.address], [ethers.parseEther("4")],   // junior
        ethers.parseEther("10"),                         // principal
        ethers.parseEther("15"),                         // collateral
        500,                                             // 5% rate
        86400 * 30                                       // 30 days
      );

      // Lender balances reduced
      expect(await lending.getLenderBalance(lender1.address)).to.equal(ethers.parseEther("94"));
      expect(await lending.getLenderBalance(lender2.address)).to.equal(ethers.parseEther("96"));
      // Borrower collateral reduced
      expect(await lending.getBorrowerCollateral(borrower.address)).to.equal(ethers.parseEther("5"));
      // Loan stored
      const loan = await lending.getLoan(0);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.principal).to.equal(ethers.parseEther("10"));
    });

    it("should revert if senior lender insufficient", async function () {
      await expect(
        lending.connect(server).executeLoan(
          borrower.address,
          [lender1.address], [ethers.parseEther("200")],
          [], [],
          ethers.parseEther("200"), ethers.parseEther("300"),
          500, 86400 * 30
        )
      ).to.be.revertedWith("senior insufficient");
    });

    it("should revert if insufficient collateral", async function () {
      await expect(
        lending.connect(server).executeLoan(
          borrower.address,
          [lender1.address], [ethers.parseEther("10")],
          [], [],
          ethers.parseEther("10"), ethers.parseEther("5"), // too little collateral
          500, 86400 * 30
        )
      ).to.be.revertedWith("below min collateral");
    });

    it("should revert if not server", async function () {
      await expect(
        lending.connect(other).executeLoan(
          borrower.address,
          [lender1.address], [ethers.parseEther("10")],
          [], [],
          ethers.parseEther("10"), ethers.parseEther("15"),
          500, 86400 * 30
        )
      ).to.be.revertedWith("only server");
    });
  });

  describe("repay", function () {
    beforeEach(async function () {
      await lending.connect(lender1).depositLend({ value: ethers.parseEther("100") });
      await lending.connect(lender2).depositLend({ value: ethers.parseEther("100") });
      await lending.connect(borrower).depositCollateral({ value: ethers.parseEther("20") });

      await lending.connect(server).executeLoan(
        borrower.address,
        [lender1.address], [ethers.parseEther("6")],
        [lender2.address], [ethers.parseEther("4")],
        ethers.parseEther("10"),
        ethers.parseEther("15"),
        500, // 5%
        86400 * 365 // 1 year for easy math
      );
    });

    it("should repay loan", async function () {
      // Advance 1 year — interest = 10 * 5% = 0.5
      await time.increase(86400 * 365);
      const owed = await lending.getOwed(0);
      // Add buffer for block timestamp advance between getOwed call and repay tx
      const buffer = ethers.parseEther("0.01");

      await lending.connect(borrower).repay(0, { value: owed + buffer });

      const loan = await lending.getLoan(0);
      expect(loan.repaid).to.be.true;
    });

    it("should distribute interest proportionally", async function () {
      await time.increase(86400 * 365);
      const owed = await lending.getOwed(0);
      const buffer = ethers.parseEther("0.01");

      await lending.connect(borrower).repay(0, { value: owed + buffer });

      // Senior had 6/10 of principal, junior 4/10
      // Interest distributed proportionally to all
      const l1Bal = await lending.getLenderBalance(lender1.address);
      const l2Bal = await lending.getLenderBalance(lender2.address);

      // lender1: 94 (remaining) + 6 (principal) + 60% of interest
      // lender2: 96 (remaining) + 4 (principal) + 40% of interest
      expect(l1Bal).to.be.gt(ethers.parseEther("100"));
      expect(l2Bal).to.be.gt(ethers.parseEther("100"));
    });

    it("should improve credit score on repay", async function () {
      await time.increase(86400 * 365);
      const owed = await lending.getOwed(0);
      const buffer = ethers.parseEther("0.01");
      await lending.connect(borrower).repay(0, { value: owed + buffer });

      expect(await lending.getCreditScore(borrower.address)).to.equal(550);
    });

    it("should revert double repay", async function () {
      await time.increase(86400 * 365);
      const owed = await lending.getOwed(0);
      const buffer = ethers.parseEther("0.01");
      await lending.connect(borrower).repay(0, { value: owed + buffer });
      await expect(lending.connect(borrower).repay(0, { value: owed + buffer })).to.be.revertedWith("already repaid");
    });

    it("should revert if not borrower", async function () {
      const owed = await lending.getOwed(0);
      await expect(lending.connect(other).repay(0, { value: owed })).to.be.revertedWith("not borrower");
    });
  });

  describe("liquidate", function () {
    beforeEach(async function () {
      await lending.connect(lender1).depositLend({ value: ethers.parseEther("100") });
      await lending.connect(lender2).depositLend({ value: ethers.parseEther("100") });
      await lending.connect(borrower).depositCollateral({ value: ethers.parseEther("20") });

      await lending.connect(server).executeLoan(
        borrower.address,
        [lender1.address], [ethers.parseEther("6")],
        [lender2.address], [ethers.parseEther("4")],
        ethers.parseEther("10"),
        ethers.parseEther("15"),
        500,
        86400 * 30 // 30 days
      );
    });

    it("should liquidate overdue loan", async function () {
      await time.increase(86400 * 31); // past due

      await lending.connect(server).liquidate(0);

      const loan = await lending.getLoan(0);
      expect(loan.defaulted).to.be.true;
    });

    it("should give senior lenders priority in collateral", async function () {
      await time.increase(86400 * 31);

      const l1Before = await lending.getLenderBalance(lender1.address);
      const l2Before = await lending.getLenderBalance(lender2.address);

      await lending.connect(server).liquidate(0);

      const l1After = await lending.getLenderBalance(lender1.address);
      const l2After = await lending.getLenderBalance(lender2.address);

      // Senior (lender1) gets their 6 ETH back first from 15 ETH collateral
      expect(l1After - l1Before).to.equal(ethers.parseEther("6"));
      // Junior (lender2) gets proportional share of remaining 9 ETH
      expect(l2After - l2Before).to.equal(ethers.parseEther("9"));
    });

    it("should decrease credit score on default", async function () {
      await time.increase(86400 * 31);
      await lending.connect(server).liquidate(0);

      expect(await lending.getCreditScore(borrower.address)).to.equal(350); // 500 - 150
    });

    it("should revert if not overdue", async function () {
      await expect(lending.connect(server).liquidate(0)).to.be.revertedWith("not overdue");
    });

    it("should revert if not server", async function () {
      await time.increase(86400 * 31);
      await expect(lending.connect(other).liquidate(0)).to.be.revertedWith("only server");
    });
  });

  describe("Credit Score & Collateral", function () {
    it("should return default score of 500", async function () {
      expect(await lending.getCreditScore(other.address)).to.equal(500);
    });

    it("should require 150% collateral for default score", async function () {
      const required = await lending.getRequiredCollateral(other.address, ethers.parseEther("10"));
      expect(required).to.equal(ethers.parseEther("15"));
    });
  });
});
