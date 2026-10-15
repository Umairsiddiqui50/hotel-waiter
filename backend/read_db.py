import sqlite3
conn = sqlite3.connect('hotel_waiter.db')
cursor = conn.cursor()
cursor.execute('SELECT * FROM staff_users')
rows = cursor.fetchall()
print('=== staff_users ===')
for r in rows:
    print(r)
conn.close()