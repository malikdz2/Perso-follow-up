import { db, type Category, type Expense } from '../db/db';
import { monthRange } from './spending';
import { budgetLevel, type BudgetLevel } from './budget';

export interface CategoryMonth {
  category: Category;
  spent: number;
  level: BudgetLevel;
  /** 0 → 1+ */
  ratio: number;
}

/** Dépenses quotidiennes d'un mois, par catégorie, avec l'état du budget. */
export async function expensesByCategory(month: string): Promise<{ total: number; rows: CategoryMonth[]; expenses: Expense[] }> {
  const [a, b] = monthRange(month);
  const [categories, expenses] = await Promise.all([db.categories.orderBy('order').toArray(), db.expenses.where('date').between(a, b, true, true).toArray()]);
  const rows = categories.map((category) => {
    const spent = expenses.filter((e) => e.categoryId === category.id).reduce((s, e) => s + e.amount, 0);
    return { category, spent, level: budgetLevel(spent, category.budget), ratio: category.budget ? spent / category.budget : 0 };
  });
  return { total: expenses.reduce((s, e) => s + e.amount, 0), rows, expenses };
}
