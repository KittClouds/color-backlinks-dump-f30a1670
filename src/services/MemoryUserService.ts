
import kuzuService from '@/lib/kuzu/KuzuService';

export interface UserProfile {
  id: string;
  name: string;
  preferences: {
    defaultImportance: number;
    autoCategorizationEnabled: boolean;
    memoryRetentionDays: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  userId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service for managing users and memory categories
 */
export class MemoryUserService {
  
  /**
   * Initialize user and category schema
   */
  async initializeSchema(): Promise<void> {
    await kuzuService.init();
    
    // Create UserProfile node table
    await kuzuService.query(`
      CREATE NODE TABLE IF NOT EXISTS UserProfile (
        id STRING PRIMARY KEY,
        name STRING,
        preferences STRING,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP
      )
    `);

    // Create MemoryCategory node table
    await kuzuService.query(`
      CREATE NODE TABLE IF NOT EXISTS MemoryCategory (
        id STRING PRIMARY KEY,
        name STRING,
        description STRING,
        color STRING,
        userId STRING,
        isDefault BOOLEAN,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP
      )
    `);

    // Create relationships
    await kuzuService.query(`
      CREATE REL TABLE IF NOT EXISTS OWNED_BY FROM Note TO UserProfile (ON DELETE CASCADE)
    `);

    await kuzuService.query(`
      CREATE REL TABLE IF NOT EXISTS CATEGORIZED_AS FROM Note TO MemoryCategory (ON DELETE SET NULL)
    `);

    await kuzuService.query(`
      CREATE REL TABLE IF NOT EXISTS MESSAGE_OWNED_BY FROM ThreadMessage TO UserProfile (ON DELETE CASCADE)
    `);

    console.log('MemoryUserService: Schema initialized');
  }

  /**
   * Create a new user profile
   */
  async createUserProfile(options: {
    id?: string;
    name: string;
    preferences?: Partial<UserProfile['preferences']>;
  }): Promise<UserProfile> {
    const { name, preferences = {} } = options;
    const id = options.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const defaultPreferences = {
      defaultImportance: 0.5,
      autoCategorizationEnabled: true,
      memoryRetentionDays: 365,
      ...preferences
    };

    await kuzuService.query(`
      CREATE (u:UserProfile {
        id: $id,
        name: $name,
        preferences: $preferences,
        createdAt: $now,
        updatedAt: $now
      })
    `, {
      id,
      name,
      preferences: JSON.stringify(defaultPreferences),
      now
    });

    // Create default categories
    await this.createDefaultCategories(id);

    return {
      id,
      name,
      preferences: defaultPreferences,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const result = await kuzuService.query(`
      MATCH (u:UserProfile) WHERE u.id = $userId
      RETURN u
    `, { userId });

    if (result.length === 0) return null;

    const user = result[0].u;
    return {
      id: user.id,
      name: user.name,
      preferences: JSON.parse(user.preferences || '{}'),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    const now = new Date().toISOString();
    const setClause: string[] = ['u.updatedAt = $now'];
    const params: Record<string, any> = { userId, now };

    if (updates.name) {
      setClause.push('u.name = $name');
      params.name = updates.name;
    }

    if (updates.preferences) {
      setClause.push('u.preferences = $preferences');
      params.preferences = JSON.stringify(updates.preferences);
    }

    await kuzuService.query(`
      MATCH (u:UserProfile) WHERE u.id = $userId
      SET ${setClause.join(', ')}
    `, params);
  }

  /**
   * Create a memory category
   */
  async createMemoryCategory(options: {
    name: string;
    description?: string;
    color?: string;
    userId: string;
    isDefault?: boolean;
  }): Promise<MemoryCategory> {
    const { name, description, color, userId, isDefault = false } = options;
    const id = `category_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    await kuzuService.query(`
      CREATE (c:MemoryCategory {
        id: $id,
        name: $name,
        description: $description,
        color: $color,
        userId: $userId,
        isDefault: $isDefault,
        createdAt: $now,
        updatedAt: $now
      })
    `, {
      id,
      name,
      description: description || '',
      color: color || '#6366f1',
      userId,
      isDefault,
      now
    });

    return {
      id,
      name,
      description,
      color,
      userId,
      isDefault,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Get categories for a user
   */
  async getUserCategories(userId: string): Promise<MemoryCategory[]> {
    const result = await kuzuService.query(`
      MATCH (c:MemoryCategory) WHERE c.userId = $userId
      RETURN c
      ORDER BY c.isDefault DESC, c.name ASC
    `, { userId });

    return result.map(r => ({
      id: r.c.id,
      name: r.c.name,
      description: r.c.description,
      color: r.c.color,
      userId: r.c.userId,
      isDefault: r.c.isDefault,
      createdAt: r.c.createdAt,
      updatedAt: r.c.updatedAt
    }));
  }

  /**
   * Create default categories for a new user
   */
  private async createDefaultCategories(userId: string): Promise<void> {
    const defaultCategories = [
      { name: 'Personal', color: '#10b981', isDefault: true },
      { name: 'Work', color: '#3b82f6', isDefault: false },
      { name: 'Learning', color: '#f59e0b', isDefault: false },
      { name: 'Ideas', color: '#8b5cf6', isDefault: false }
    ];

    for (const category of defaultCategories) {
      await this.createMemoryCategory({
        ...category,
        userId
      });
    }
  }

  /**
   * Delete a memory category
   */
  async deleteMemoryCategory(categoryId: string): Promise<void> {
    // First, unassign any memories from this category
    await kuzuService.query(`
      MATCH (n:Note)-[r:CATEGORIZED_AS]->(c:MemoryCategory)
      WHERE c.id = $categoryId
      DELETE r
    `, { categoryId });

    // Then delete the category
    await kuzuService.query(`
      MATCH (c:MemoryCategory) WHERE c.id = $categoryId
      DELETE c
    `, { categoryId });
  }

  /**
   * Assign memory to category
   */
  async assignMemoryToCategory(memoryId: string, categoryId: string): Promise<void> {
    // Remove existing category assignment
    await kuzuService.query(`
      MATCH (n:Note)-[r:CATEGORIZED_AS]->(:MemoryCategory)
      WHERE n.id = $memoryId
      DELETE r
    `, { memoryId });

    // Create new category assignment
    await kuzuService.query(`
      MATCH (n:Note), (c:MemoryCategory)
      WHERE n.id = $memoryId AND c.id = $categoryId
      CREATE (n)-[:CATEGORIZED_AS]->(c)
    `, { memoryId, categoryId });
  }
}

export const memoryUserService = new MemoryUserService();
