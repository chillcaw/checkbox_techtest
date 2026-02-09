## PostgreSQL Final Query Analysis

### Table 1: Tables and Scans

| Table Name                     | Scan Type        | Scan Count | Scan Time | Scan %  |
| ------------------------------ | ---------------- | ---------- | --------- | ------- |
| ticketing_field_options        | Index Scan       | 1          | 0.015 ms  | 100.0 % |
| ticketing_field_status_options | Index Scan       | 1          | 0.008 ms  | 100.0 % |
| ticketing_fields               | Index Scan       | 1          | 0.045 ms  | 90.0 %  |
| ticketing_fields               | Seq Scan         | 1          | 0.005 ms  | 10.0 %  |
| ticketing_ticket               | Index Scan       | 1          | 2.454 ms  | 100.0 % |
| ticketing_ticket_field_value   | Bitmap Heap Scan | 2          | 1.682 ms  | 31.4 %  |
| ticketing_ticket_field_value   | Index Scan       | 1          | 3.681 ms  | 68.6 %  |
| users                          | Index Scan       | 1          | 0.015 ms  | 100.0 % |

---

### Table 2: Plan Nodes

| Node Type         | Count | Time     | % of Total |
| ----------------- | ----- | -------- | ---------- |
| Bitmap Heap Scan  | 2     | 1.682 ms | 15.2 %     |
| Bitmap Index Scan | 2     | 0.551 ms | 5.0 %      |
| Hash              | 1     | 0.007 ms | 0.1 %      |
| Hash Join         | 1     | 0.312 ms | 2.8 %      |
| Index Scan        | 6     | 6.218 ms | 56.1 %     |
| Limit             | 1     | 0.002 ms | 0.0 %      |
| Memoize           | 4     | 0.045 ms | 0.4 %      |
| Nested Loop       | 7     | 1.070 ms | 9.7 %      |
| Seq Scan          | 1     | 0.005 ms | 0.0 %      |
| Sort              | 2     | 0.973 ms | 8.8 %      |
| Subquery Scan     | 1     | 0.007 ms | 0.1 %      |
| Unique            | 1     | 0.286 ms | 2.6 %      |
