import sqlite3
import os
os.chdir('C:\\Users\\ASUS\\Downloads\\hotel-waiter\\backend')
conn = sqlite3.connect('hotel_waiter.db')
cursor = conn.cursor()
# Check all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("=== Tables ===")
for t in tables:
    print(t[0])
    
# Check OTP verifications
print("\n=== otp_verifications ===")
try:
    cursor.execute('SELECT * FROM otp_verifications')
    rows = cursor.fetchall()
    for r in rows:
        print(r)
except Exception as e:
    print(f"Error: {e}")

# Check service_requests
print("\n=== service_requests ===")
try:
    cursor.execute('SELECT * FROM service_requests LIMIT 5')
    rows = cursor.fetchall()
    for r in rows:
        print(r)
except Exception as e:
    print(f"Error: {e}")

conn.close()