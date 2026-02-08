// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GhostLending {
    struct Loan {
        address borrower;
        uint256 principal;
        uint256 collateralAmount;
        uint256 rate; // basis points (e.g., 500 = 5%)
        uint256 duration; // seconds
        uint256 startTime;
        address[] seniorLenders;
        uint256[] seniorAmounts;
        address[] juniorLenders;
        uint256[] juniorAmounts;
        bool repaid;
        bool defaulted;
    }

    // Collateral tier: score range -> required collateral ratio (basis points)
    struct CollateralTier {
        uint256 minScore;
        uint256 maxScore;
        uint256 ratioBps; // e.g., 15000 = 150%
    }

    address public server;
    uint256 public loanCount;

    mapping(address => uint256) public lenderBalances;
    mapping(address => uint256) public borrowerCollateral;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256) public creditScores; // 0-1000
    CollateralTier[] public collateralTiers;

    event LendDeposited(address indexed lender, uint256 amount);
    event LendWithdrawn(address indexed lender, uint256 amount);
    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 principal);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 totalPaid);
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower);

    modifier onlyServer() {
        require(msg.sender == server, "only server");
        _;
    }

    constructor(address _server) {
        server = _server;
        // Default collateral tiers
        collateralTiers.push(CollateralTier(0, 299, 20000));     // 0-299: 200%
        collateralTiers.push(CollateralTier(300, 599, 15000));   // 300-599: 150%
        collateralTiers.push(CollateralTier(600, 799, 12000));   // 600-799: 120%
        collateralTiers.push(CollateralTier(800, 1000, 10000));  // 800-1000: 100%
        // Everyone starts at 500
    }

    // ---- User Functions ----

    function depositLend() external payable {
        require(msg.value > 0, "zero amount");
        lenderBalances[msg.sender] += msg.value;
        emit LendDeposited(msg.sender, msg.value);
    }

    function withdrawLend(uint256 amount) external {
        require(lenderBalances[msg.sender] >= amount, "insufficient balance");
        lenderBalances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit LendWithdrawn(msg.sender, amount);
    }

    function depositCollateral() external payable {
        require(msg.value > 0, "zero amount");
        borrowerCollateral[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function withdrawCollateral(uint256 amount) external {
        require(borrowerCollateral[msg.sender] >= amount, "insufficient collateral");
        borrowerCollateral[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function repay(uint256 loanId) external payable {
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "not borrower");
        require(!loan.repaid, "already repaid");
        require(!loan.defaulted, "loan defaulted");

        uint256 owed = getOwed(loanId);
        require(msg.value >= owed, "insufficient repayment");

        loan.repaid = true;

        // Distribute to senior lenders first
        uint256 totalSenior = 0;
        for (uint256 i = 0; i < loan.seniorAmounts.length; i++) {
            totalSenior += loan.seniorAmounts[i];
        }
        uint256 totalJunior = 0;
        for (uint256 i = 0; i < loan.juniorAmounts.length; i++) {
            totalJunior += loan.juniorAmounts[i];
        }

        uint256 interest = owed - loan.principal;

        // Senior gets principal + proportional interest first
        for (uint256 i = 0; i < loan.seniorLenders.length; i++) {
            uint256 share = loan.seniorAmounts[i];
            uint256 interestShare = totalSenior > 0 ? (interest * share) / (totalSenior + totalJunior) : 0;
            lenderBalances[loan.seniorLenders[i]] += share + interestShare;
        }

        // Junior gets remaining
        for (uint256 i = 0; i < loan.juniorLenders.length; i++) {
            uint256 share = loan.juniorAmounts[i];
            uint256 interestShare = totalJunior > 0 ? (interest * share) / (totalSenior + totalJunior) : 0;
            lenderBalances[loan.juniorLenders[i]] += share + interestShare;
        }

        // Return collateral to borrower
        uint256 col = loan.collateralAmount;
        loan.collateralAmount = 0;
        payable(loan.borrower).transfer(col);

        // Improve credit score (cap at 1000)
        uint256 score = creditScores[msg.sender];
        if (score == 0) score = 500;
        score = score + 50 > 1000 ? 1000 : score + 50;
        creditScores[msg.sender] = score;

        // Refund excess
        if (msg.value > owed) {
            payable(msg.sender).transfer(msg.value - owed);
        }

        emit LoanRepaid(loanId, msg.sender, owed);
    }

    // ---- Server Functions ----

    function executeLoan(
        address borrower,
        address[] calldata seniorLenders,
        uint256[] calldata seniorAmounts,
        address[] calldata juniorLenders,
        uint256[] calldata juniorAmounts,
        uint256 principal,
        uint256 collateralAmount,
        uint256 rate,
        uint256 duration
    ) external onlyServer {
        // Verify lender balances
        for (uint256 i = 0; i < seniorLenders.length; i++) {
            require(lenderBalances[seniorLenders[i]] >= seniorAmounts[i], "senior insufficient");
            lenderBalances[seniorLenders[i]] -= seniorAmounts[i];
        }
        for (uint256 i = 0; i < juniorLenders.length; i++) {
            require(lenderBalances[juniorLenders[i]] >= juniorAmounts[i], "junior insufficient");
            lenderBalances[juniorLenders[i]] -= juniorAmounts[i];
        }

        // Lock collateral
        require(borrowerCollateral[borrower] >= collateralAmount, "insufficient collateral");
        borrowerCollateral[borrower] -= collateralAmount;

        // Verify required collateral
        require(collateralAmount >= getRequiredCollateral(borrower, principal), "below min collateral");

        uint256 id = loanCount++;
        loans[id] = Loan({
            borrower: borrower,
            principal: principal,
            collateralAmount: collateralAmount,
            rate: rate,
            duration: duration,
            startTime: block.timestamp,
            seniorLenders: seniorLenders,
            seniorAmounts: seniorAmounts,
            juniorLenders: juniorLenders,
            juniorAmounts: juniorAmounts,
            repaid: false,
            defaulted: false
        });

        // Transfer principal to borrower
        payable(borrower).transfer(principal);

        emit LoanCreated(id, borrower, principal);
    }

    function liquidate(uint256 loanId) external onlyServer {
        Loan storage loan = loans[loanId];
        require(!loan.repaid, "already repaid");
        require(!loan.defaulted, "already defaulted");
        require(isOverdue(loanId), "not overdue");

        loan.defaulted = true;

        uint256 collateral = loan.collateralAmount;
        loan.collateralAmount = 0;

        // Distribute collateral: senior first, junior gets remainder
        uint256 totalSenior = 0;
        for (uint256 i = 0; i < loan.seniorAmounts.length; i++) {
            totalSenior += loan.seniorAmounts[i];
        }

        uint256 remaining = collateral;

        // Senior gets up to their principal from collateral
        for (uint256 i = 0; i < loan.seniorLenders.length; i++) {
            uint256 payout = loan.seniorAmounts[i];
            if (payout > remaining) payout = remaining;
            lenderBalances[loan.seniorLenders[i]] += payout;
            remaining -= payout;
        }

        // Junior gets whatever is left, proportionally
        if (remaining > 0) {
            uint256 totalJunior = 0;
            for (uint256 i = 0; i < loan.juniorAmounts.length; i++) {
                totalJunior += loan.juniorAmounts[i];
            }
            for (uint256 i = 0; i < loan.juniorLenders.length; i++) {
                uint256 payout = totalJunior > 0 ? (remaining * loan.juniorAmounts[i]) / totalJunior : 0;
                lenderBalances[loan.juniorLenders[i]] += payout;
            }
        }

        // Decrease credit score (min 0)
        uint256 score = creditScores[loan.borrower];
        if (score == 0) score = 500;
        score = score > 150 ? score - 150 : 0;
        creditScores[loan.borrower] = score;

        emit LoanDefaulted(loanId, loan.borrower);
    }

    // ---- View Functions ----

    function getLenderBalance(address lender) external view returns (uint256) {
        return lenderBalances[lender];
    }

    function getBorrowerCollateral(address borrower) external view returns (uint256) {
        return borrowerCollateral[borrower];
    }

    function getLoan(uint256 loanId) external view returns (
        address borrower,
        uint256 principal,
        uint256 collateralAmount,
        uint256 rate,
        uint256 duration,
        uint256 startTime,
        bool repaid,
        bool defaulted
    ) {
        Loan storage l = loans[loanId];
        return (l.borrower, l.principal, l.collateralAmount, l.rate, l.duration, l.startTime, l.repaid, l.defaulted);
    }

    function getOwed(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        uint256 interest = (loan.principal * loan.rate * (block.timestamp - loan.startTime)) / (10000 * 365 days);
        return loan.principal + interest;
    }

    function isOverdue(uint256 loanId) public view returns (bool) {
        Loan storage loan = loans[loanId];
        return !loan.repaid && !loan.defaulted && block.timestamp > loan.startTime + loan.duration;
    }

    function getRequiredCollateral(address borrower, uint256 principal) public view returns (uint256) {
        uint256 score = creditScores[borrower];
        if (score == 0) score = 500; // default
        for (uint256 i = 0; i < collateralTiers.length; i++) {
            if (score >= collateralTiers[i].minScore && score <= collateralTiers[i].maxScore) {
                return (principal * collateralTiers[i].ratioBps) / 10000;
            }
        }
        return (principal * 20000) / 10000; // fallback 200%
    }

    function getCreditScore(address user) external view returns (uint256) {
        uint256 score = creditScores[user];
        return score == 0 ? 500 : score;
    }

    function getLoanLenders(uint256 loanId) external view returns (
        address[] memory seniorLenders,
        uint256[] memory seniorAmounts,
        address[] memory juniorLenders,
        uint256[] memory juniorAmounts
    ) {
        Loan storage l = loans[loanId];
        return (l.seniorLenders, l.seniorAmounts, l.juniorLenders, l.juniorAmounts);
    }
}
