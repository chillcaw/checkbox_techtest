import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://matter:matter@postgres:5432/matter_db',
});

// Helper to generate random date within range
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper to add hours to date
function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('Starting seed process...');
    
    // Create account
    console.log('Creating account...');
    const accountResult = await client.query(
      `INSERT INTO accounts (account_name) VALUES ('Demo Account') RETURNING account_id`
    );
    const accountId = accountResult.rows[0].account_id;
    
    // Create users
    console.log('Creating users...');
    const userIds = [];
    const userNames = [
      { first: 'John', last: 'Doe', email: 'john.doe@example.com' },
      { first: 'Jane', last: 'Smith', email: 'jane.smith@example.com' },
      { first: 'Mike', last: 'Johnson', email: 'mike.johnson@example.com' },
      { first: 'Sarah', last: 'Williams', email: 'sarah.williams@example.com' },
      { first: 'David', last: 'Brown', email: 'david.brown@example.com' },
    ];
    
    for (const user of userNames) {
      const result = await client.query(
        `INSERT INTO users (account_id, email, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id`,
        [accountId, user.email, user.first, user.last]
      );
      userIds.push(result.rows[0].id);
    }
    
    const defaultUserId = userIds[0];
    
    // Create board
    console.log('Creating board...');
    const boardResult = await client.query(
      `INSERT INTO ticketing_board (account_id, name) VALUES ($1, 'Legal Matters') RETURNING id`,
      [accountId]
    );
    const boardId = boardResult.rows[0].id;
    
    // Create status groups
    console.log('Creating status groups...');
    const statusGroups = {};
    const groupNames = ['To Do', 'In Progress', 'Done'];
    
    for (let i = 0; i < groupNames.length; i++) {
      const result = await client.query(
        `INSERT INTO ticketing_field_status_groups (account_id, name, sequence, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [accountId, groupNames[i], i + 1, defaultUserId, defaultUserId]
      );
      statusGroups[groupNames[i]] = result.rows[0].id;
    }
    
    // Create currency options
    console.log('Creating currency options...');
    const currencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    ];
    
    for (let i = 0; i < currencies.length; i++) {
      await client.query(
        `INSERT INTO ticketing_currency_field_options (account_id, code, name, symbol, sequence) 
         VALUES ($1, $2, $3, $4, $5)`,
        [accountId, currencies[i].code, currencies[i].name, currencies[i].symbol, i + 1]
      );
    }
    
    // Create fields
    console.log('Creating fields...');
    const fields = {};
    
    // Text field - Matter Subject
    const subjectField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, system_field, created_by, updated_by) 
       VALUES ($1, 'subject', 'text', true, $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.subject = subjectField.rows[0].id;
    
    // Text field - Description
    const descField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Description', 'text', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.description = descField.rows[0].id;
    
    // Number field - Case Number
    const caseNumField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Case Number', 'number', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.caseNumber = caseNumField.rows[0].id;
    
    // User field - Assigned To
    const assignedField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Assigned To', 'user', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.assignedTo = assignedField.rows[0].id;
    
    // Currency field - Contract Value
    const currencyField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Contract Value', 'currency', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.contractValue = currencyField.rows[0].id;
    
    // Boolean field - Urgent
    const urgentField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Urgent', 'boolean', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.urgent = urgentField.rows[0].id;
    
    // Date field - Due Date
    const dueDateField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Due Date', 'date', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.dueDate = dueDateField.rows[0].id;
    
    // Select field - Priority
    const priorityField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, created_by, updated_by) 
       VALUES ($1, 'Priority', 'select', $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.priority = priorityField.rows[0].id;
    
    // Priority options
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const priorityOptions = {};
    for (let i = 0; i < priorities.length; i++) {
      const result = await client.query(
        `INSERT INTO ticketing_field_options (ticket_field_id, label, sequence, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [fields.priority, priorities[i], i + 1, defaultUserId, defaultUserId]
      );
      priorityOptions[priorities[i]] = result.rows[0].id;
    }
    
    // Status field
    const statusField = await client.query(
      `INSERT INTO ticketing_fields (account_id, name, field_type, system_field, created_by, updated_by) 
       VALUES ($1, 'Status', 'status', true, $2, $3) RETURNING id`,
      [accountId, defaultUserId, defaultUserId]
    );
    fields.status = statusField.rows[0].id;
    
    // Status options
    const statusOptions = {};
    const statuses = [
      { label: 'To Do', group: 'To Do' },
      { label: 'In Progress', group: 'In Progress' },
      { label: 'Done', group: 'Done' },
    ];
    
    for (let i = 0; i < statuses.length; i++) {
      const result = await client.query(
        `INSERT INTO ticketing_field_status_options (ticket_field_id, group_id, label, sequence, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [fields.status, statusGroups[statuses[i].group], statuses[i].label, i + 1, defaultUserId, defaultUserId]
      );
      statusOptions[statuses[i].label] = result.rows[0].id;
    }
    
    // Create 10,000 matters
    console.log('Creating 10,000 matters...');
    const matterTypes = [
      'Contract Review', 'Litigation', 'Compliance Matter', 'Intellectual Property',
      'Employment Dispute', 'Merger & Acquisition', 'Real Estate Transaction', 'Patent Filing'
    ];
    
    const startDate = new Date('2023-01-01');
    const endDate = new Date('2024-12-31');
    
    for (let i = 0; i < 10000; i++) {
      if (i % 1000 === 0) {
        console.log(`Created ${i} matters...`);
      }
      
      // Create ticket
      const ticketResult = await client.query(
        `INSERT INTO ticketing_ticket (board_id) VALUES ($1) RETURNING id`,
        [boardId]
      );
      const ticketId = ticketResult.rows[0].id;
      
      // Random matter type
      const matterType = matterTypes[Math.floor(Math.random() * matterTypes.length)];
      
      // Subject
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, text_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.subject, `${matterType} - Matter #${i + 1}`, defaultUserId, defaultUserId]
      );
      
      // Description
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, text_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.description, `This is a ${matterType.toLowerCase()} requiring attention and review.`, defaultUserId, defaultUserId]
      );
      
      // Case Number
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, number_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.caseNumber, 2024000 + i, defaultUserId, defaultUserId]
      );
      
      // Assigned To
      const assignedUserId = userIds[Math.floor(Math.random() * userIds.length)];
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, user_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.assignedTo, assignedUserId, defaultUserId, defaultUserId]
      );
      
      // Contract Value
      const amount = Math.floor(Math.random() * 1000000) + 10000;
      const currency = currencies[Math.floor(Math.random() * currencies.length)].code;
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, currency_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.contractValue, JSON.stringify({ amount, currency }), defaultUserId, defaultUserId]
      );
      
      // Urgent (30% chance)
      const isUrgent = Math.random() < 0.3;
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, boolean_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.urgent, isUrgent, defaultUserId, defaultUserId]
      );
      
      // Due Date
      const dueDate = randomDate(new Date(), addHours(new Date(), 720)); // Within next 30 days
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, date_value, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.dueDate, dueDate, defaultUserId, defaultUserId]
      );
      
      // Priority
      const priorityOption = Object.values(priorityOptions)[Math.floor(Math.random() * priorities.length)];
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, select_reference_value_uuid, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.priority, priorityOption, defaultUserId, defaultUserId]
      );
      
      // Status with cycle time tracking
      const statusRandom = Math.random();
      let currentStatus;
      let statusHistory = [];
      
      const createdDate = randomDate(startDate, endDate);
      
      if (statusRandom < 0.3) {
        // 30% in "To Do"
        currentStatus = statusOptions['To Do'];
        statusHistory.push({
          from: null,
          to: statusOptions['To Do'],
          time: createdDate
        });
      } else if (statusRandom < 0.6) {
        // 30% in "In Progress"
        currentStatus = statusOptions['In Progress'];
        const toDoTime = createdDate;
        const inProgressTime = addHours(toDoTime, Math.random() * 24 + 1); // 1-25 hours later
        
        statusHistory.push({
          from: null,
          to: statusOptions['To Do'],
          time: toDoTime
        });
        statusHistory.push({
          from: statusOptions['To Do'],
          to: statusOptions['In Progress'],
          time: inProgressTime
        });
      } else {
        // 40% "Done" (but some will be reopened if timestamps overlap)
        const toDoTime = createdDate;
        const inProgressTime = addHours(toDoTime, Math.random() * 4 + 0.5); // 0.5-4.5 hours later
        
        // Vary the resolution time to create Met/Breached SLAs
        const resolutionHours = Math.random() < 0.7 ? 
          Math.random() * 7 + 1 : // 70% will be Met (1-8 hours)
          Math.random() * 16 + 8; // 30% will be Breached (8-24 hours)
        
        const doneTime = addHours(toDoTime, resolutionHours);
        
        // Build transitions
        const transitions = [
          { to: statusOptions['To Do'], time: toDoTime },
          { to: statusOptions['In Progress'], time: inProgressTime },
          { to: statusOptions['Done'], time: doneTime }
        ];
        
        // Sort by time to get chronological order
        transitions.sort((a, b) => a.time - b.time);
        
        // Current status should be the LAST transition by time (not logical order)
        currentStatus = transitions[transitions.length - 1].to;
        
        // Add from_status based on chronological order
        statusHistory = transitions.map((transition, index) => ({
          from: index === 0 ? null : transitions[index - 1].to,
          to: transition.to,
          time: transition.time
        }));
      }
      
      // Insert status
      await client.query(
        `INSERT INTO ticketing_ticket_field_value (ticket_id, ticket_field_id, status_reference_value_uuid, created_by, updated_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, fields.status, currentStatus, defaultUserId, defaultUserId]
      );
      
      // Insert cycle time history
      for (const transition of statusHistory) {
        await client.query(
          `INSERT INTO ticketing_cycle_time_histories (ticket_id, status_field_id, from_status_id, to_status_id, transitioned_at) 
           VALUES ($1, $2, $3, $4, $5)`,
          [ticketId, fields.status, transition.from, transition.to, transition.time]
        );
      }
    }
    
    console.log('Seed completed successfully!');
    console.log(`Created:
  - 1 account
  - ${userIds.length} users
  - 1 board
  - 3 status groups
  - ${Object.keys(fields).length} fields
  - 10,000 matters with full cycle time tracking
    `);
    
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);

