import { pgTable, serial, text, numeric, boolean, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";

export const intentTypeEnum = pgEnum("intent_type", ["lend", "borrow"]);
export const trancheEnum = pgEnum("tranche", ["senior", "junior"]);
export const loanStatusEnum = pgEnum("loan_status", ["active", "repaid", "defaulted"]);
export const positionStatusEnum = pgEnum("position_status", ["active", "repaid", "defaulted"]);

export const intents = pgTable("intents", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  amount: numeric("amount").notNull(),
  minRate: numeric("min_rate"),
  maxRate: numeric("max_rate"),
  duration: integer("duration").notNull(), // seconds
  tranche: trancheEnum("tranche"),
  type: intentTypeEnum("type").notNull(),
  signature: text("signature"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().unique(), // on-chain loan ID
  borrower: text("borrower").notNull(),
  principal: numeric("principal").notNull(),
  collateralAmount: numeric("collateral_amount").notNull(),
  rate: integer("rate").notNull(), // basis points
  duration: integer("duration").notNull(), // seconds
  startTime: timestamp("start_time").notNull(),
  seniorLenders: jsonb("senior_lenders").$type<string[]>().notNull(),
  seniorAmounts: jsonb("senior_amounts").$type<string[]>().notNull(),
  juniorLenders: jsonb("junior_lenders").$type<string[]>().notNull(),
  juniorAmounts: jsonb("junior_amounts").$type<string[]>().notNull(),
  status: loanStatusEnum("status").default("active").notNull(),
});

export const lenderPositions = pgTable("lender_positions", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull(),
  lender: text("lender").notNull(),
  amount: numeric("amount").notNull(),
  tranche: trancheEnum("tranche").notNull(),
  status: positionStatusEnum("status").default("active").notNull(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  type: text("type").notNull(), // deposit_lend, withdraw_lend, deposit_collateral, withdraw_collateral, loan_created, loan_repaid, loan_defaulted
  amount: numeric("amount"),
  txHash: text("tx_hash"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  details: jsonb("details").$type<Record<string, any>>(),
});
