const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bodyParser = require('body-parser');
// const bcrypt = require('bcrypt'); // Removed bcrypt - Keep it removed for plain text passwords
const dbConfig = require('./dbconfig');

const app = express();
const port = 3000;

let pool;

// Initialize DB connection pool
async function initializeDB() {
  try {
    pool = await mysql.createPool(dbConfig);
    console.log('Database connection pool initialized');
  } catch (err) {
    console.error('Failed to initialize database pool:', err);
    throw err;
  }
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'examEligibilitySecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, //  Consider setting to true in production if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Authentication middlewares
function redirectLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
}

function redirectTeacher(req, res, next) {
  if (req.session.role !== 'teacher') {
    return res.status(403).send('Access denied. Teacher role required.'); // Improved message
  }
  next();
}

function redirectStudent(req, res, next) {
  if (req.session.role !== 'student') {
    return res.status(403).send('Access denied. Student role required.'); // Improved message
  }
  next();
}

// Login page
app.get('/', (req, res) => {
  const error = req.query.error ? `<p style="color:red;">${req.query.error}</p>` : '';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Exam Eligibility Login</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f4f6f8;
          margin: 0; /* Reset default body margin */
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh; /* Ensure full viewport height */
        }
        .login-container {
          max-width: 400px;
          width: 90%; /* Responsive width */
          margin: 20px; /* Add margin for mobile */
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          box-sizing: border-box; /* Include padding in width */
        }
        h2 {
          text-align: center;
          color: #333;
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-top: 15px;
          font-weight: bold;
          color: #555;
        }
        input[type="text"],
        input[type="password"] {
          width: 100%;
          padding: 10px;
          margin-top: 5px;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-sizing: border-box; /* Ensure padding doesn't affect width */
        }
        button {
          margin-top: 20px;
          width: 100%;
          background: #007bff;
          color: white;
          padding: 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.3s ease;
        }
        button:hover {
          background: #0056b3;
        }
        @media (max-width: 600px) {
          .login-container {
            padding: 20px;
            border-radius: 6px;
          }
          input[type="text"],
          input[type="password"] {
            padding: 9px;
          }
          button {
            padding: 11px;
            font-size: 14px;
          }
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>Exam Eligibility Login</h2>
        ${error}
        <form method="POST" action="/login">
          <label for="username">Username:</label>
          <input type="text" id="username" name="username" required autofocus />
          <label for="password">Password:</label>
          <input type="password" id="password" name="password" required />
          <button type="submit">Login</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Login handler
app.post('/login', async (req, res) => {
  //  TEMPORARY HARDCODED LOGIN FOR TESTING -  FOR DEVELOPMENT ONLY
  if (req.body.username === 'testteacher' && req.body.password === 'test') {
    req.session.userId = 99999;
    req.session.username = 'testteacher';
    req.session.role = 'teacher';
    console.log('TEMPORARY LOGIN SUCCESSFUL (HARDCODED)');
    return res.redirect('/teacher');
  }
  try {
    const { username, password } = req.body;
    console.log('Login attempt - Username:', username, 'Password (plain):', password);

    if (!username || !password) {
      console.log('Error: Username and password required');
      return res.redirect('/?error=Please enter username and password');
    }

    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);

    if (!users || users.length === 0) {
      console.log('Error: User not found');
      return res.redirect('/?error=Invalid username or password');
    }

    const user = users[0];
    console.log('DB User:', user);
    console.log('DB Username:', user.username);
    console.log('DB Password (plain):', user.password); //  Plain text password from DB

    const valid = password === user.password; // Plain text comparison
    console.log('Plain text password comparison result:', valid);

    if (!valid) {
      console.log('Error: Password does not match');
      return res.redirect('/?error=Invalid username or password');
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    console.log('Login successful - Role:', req.session.role);
    console.log('Session:', req.session);

    if (user.role === 'teacher') {
      res.redirect('/teacher');
    } else {
      res.redirect('/student');
    }
  } catch (err) {
    console.error('Error during login:', err);
    res.redirect('/?error=Server error'); //  Keep generic error for security
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      //  Consider redirecting to an error page, but for now, redirect to home
      return res.redirect('/');
    }
    res.redirect('/');
  });
});

// Teacher dashboard - add student, enter marks and attendance
app.get('/teacher', redirectLogin, redirectTeacher, async (req, res) => {
  try {
    const [students] = await pool.query('SELECT id, username FROM users WHERE role = ?', ['student']);
    const studentOptions = students.map((student) => `<option value="${student.id}">${student.username}</option>`).join('');

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Teacher Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f0f4f8;
            padding: 20px;
            margin: 0; /* Reset default body margin */
          }
          nav {
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between; /* Space out items */
            align-items: center; /* Vertically center items */
          }
          nav a {
            margin-right: 0; /* Remove right margin */
            color: #007bff;
            text-decoration: none;
            font-weight: bold;
            transition: color 0.3s ease; /* Smooth transition */
          }
          nav a:hover {
            text-decoration: underline;
            color: #004080; /* Darker blue on hover */
          }
          .container {
            max-width: 800px; /* Increased max-width for larger screens */
            margin: 20px auto; /* Center with margin on top/bottom */
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            box-sizing: border-box; /* Include padding in width */
          }
          form {
            margin-top: 20px;
          }
          label {
            display: block;
            margin-top: 15px;
            font-weight: bold;
            color: #555;
          }
          input,
          select {
            width: 100%;
            padding: 10px;
            margin-top: 5px;
            border-radius: 4px;
            border: 1px solid #ccc;
            box-sizing: border-box; /* Ensure padding doesn't affect width */
          }
          button {
            margin-top: 20px;
            padding: 12px;
            width: 100%;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s ease; /* Smooth transition */
          }
          button:hover {
            background: #0056b3;
          }
          h2 {
            color: #333;
            margin-bottom: 25px;
            text-align: center;
          }
          @media (max-width: 768px) {
            .container {
              margin: 10px;
              padding: 20px;
              width: 95%;
            }
            input,
            select {
              padding: 9px;
            }
            button {
              padding: 11px;
              font-size: 14px;
            }
            nav {
              flex-direction: column; /* Stack items on small screens */
              align-items: flex-start; /* Align items to the start (left) */
            }
            nav a {
              margin-bottom: 10px; /* Add margin below each link */
            }
          }
        </style>
      </head>
      <body>
        <nav>
          <span>Welcome, ${req.session.username} (Teacher)</span>
          <a href="/logout">Logout</a>
        </nav>
        <div class="container">
          <h2>Add New Student</h2>
          <form method="POST" action="/teacher/add-student">
            <label for="new_username">Username:</label>
            <input type="text" id="new_username" name="username" required />
            <label for="new_password">Password:</label>
            <input type="password" id="new_password" name="password" required />
            <button type="submit">Add Student</button>
          </form>

          <h2>Enter/Update Marks and Attendance</h2>
          <form method="POST" action="/teacher/submit">
            <label for="student_id">Select Student:</label>
            <select name="student_id" id="student_id" required>
              <option value="" disabled selected>Select a student</option>
              ${studentOptions}
            </select>
            <label for="subject">Subject:</label>
            <input type="text" id="subject" name="subject" placeholder="Enter subject name" required />
            <label for="marks">Marks (0 to 100):</label>
            <input type="number" id="marks" name="marks" min="0" max="100" required />
            <label for="attendance">Attendance Percentage (0 to 100):</label>
            <input type="number" id="attendance" name="attendance" min="0" max="100" required />
            <button type="submit">Save</button>
          </form>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error loading teacher dashboard:', err);
    res.status(500).send('Error loading teacher dashboard');
  }
});

// Add new student route
app.post('/teacher/add-student', redirectLogin, redirectTeacher, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).send('Username and password required');
    }
    if (username.toLowerCase() === 'teacher1') {
      return res.status(400).send('Cannot use reserved username');
    }

    const [existing] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (existing && existing.length > 0) { // Check if existing has any elements
      return res.status(400).send('Username already taken');
    }
    // Store the password as plain text.  AGAIN, THIS IS INSECURE
    await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, 'student']);
    res.redirect('/teacher');
  } catch (err) {
    console.error('Error adding student:', err);
    res.status(500).send('Error adding student');
  }
});

// Handle marks and attendance submit
app.post('/teacher/submit', redirectLogin, redirectTeacher, async (req, res) => {
  try {
    const { student_id, subject, marks, attendance } = req.body;

    if (!student_id || !subject || !marks || !attendance) {
      return res.status(400).send('All fields required');
    }

    const marksInt = parseInt(marks, 10); //  Use parseInt with radix
    const attendanceFloat = parseFloat(attendance);

    if (
      isNaN(marksInt) ||
      marksInt < 0 ||
      marksInt > 100 ||
      isNaN(attendanceFloat) ||
      attendanceFloat < 0 ||
      attendanceFloat > 100
    ) {
      return res.status(400).send('Invalid marks or attendance');
    }

    //  Use placeholders to prevent SQL injection
    const [existingMarks] = await pool.query(
      'SELECT id FROM marks WHERE student_id = ? AND subject = ?',
      [student_id, subject]
    );

    if (existingMarks && existingMarks.length > 0) {
      await pool.query('UPDATE marks SET marks = ? WHERE id = ?', [marksInt, existingMarks[0].id]);
    } else {
      await pool.query('INSERT INTO marks (student_id, subject, marks) VALUES (?, ?, ?)', [
        student_id,
        subject,
        marksInt,
      ]);
    }

    const [existingAttendance] = await pool.query('SELECT id FROM attendance WHERE student_id = ?', [
      student_id,
    ]);
    if (existingAttendance && existingAttendance.length > 0) {
      await pool.query('UPDATE attendance SET attendance_percent = ? WHERE id = ?', [
        attendanceFloat,
        existingAttendance[0].id,
      ]);
    } else {
      await pool.query('INSERT INTO attendance (student_id, attendance_percent) VALUES (?, ?)', [
        student_id,
        attendanceFloat,
      ]);
    }

    res.redirect('/teacher');
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).send('Error saving data');
  }
});

// Student dashboard
app.get('/student', redirectLogin, redirectStudent, async (req, res) => {
  try {
    const studentId = req.session.userId;

    // Get marks and attendance using placeholders
    const [marks] = await pool.query('SELECT subject, marks FROM marks WHERE student_id = ?', [
      studentId,
    ]);
    const [attendanceRows] = await pool.query(
      'SELECT attendance_percent FROM attendance WHERE student_id = ?',
      [studentId]
    );

    const attendancePercent = attendanceRows && attendanceRows.length > 0 ? attendanceRows[0].attendance_percent : 0;

    // Calculate average marks
    const totalMarks = marks.reduce((sum, m) => sum + m.marks, 0);
    const avgMarks = marks.length > 0 ? totalMarks / marks.length : 0;

    // Determine eligibility
    const reasons = [];
    let eligibility = 'Eligible';
    if (avgMarks < 40) {
      eligibility = 'Ineligible';
      reasons.push('Marks below 40%');
    }
    if (attendancePercent < 75) {
      eligibility = 'Ineligible';
      reasons.push('Attendance below 75%');
    }

    const marksRows = marks && marks.length > 0
      ? marks
        .map((item) => `<tr><td>${item.subject}</td><td>${item.marks}</td></tr>`)
        .join('')
      : '<tr><td colspan="2">No marks entered yet</td></tr>';

    const reasonsHtml = reasons.length > 0
      ? `<ul>${reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>`
      : '<p>None</p>';

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Student Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #eef2f7;
            padding: 20px;
            margin: 0; /* Reset default body margin */
          }
          nav {
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between; /* Space out items */
            align-items: center; /* Vertically center items */
          }
          nav a {
            color: #007bff;
            text-decoration: none;
            font-weight: bold;
            transition: color 0.3s ease;
          }
          nav a:hover {
            text-decoration: underline;
            color: #004080;
          }
          .container {
            max-width: 800px;
            margin: 20px auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            box-sizing: border-box;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th,
          td {
            border: 1px solid #ccc;
            text-align: left;
            padding: 12px;
          }
          th {
            background: #007bff;
            color: white;
          }
          .eligibility {
            margin-top: 20px;
            font-weight: bold;
            font-size: 18px;
          }
          .eligible {
            color: green;
          }
          .ineligible {
            color: red;
          }
          h2{
            margin-bottom: 25px;
            text-align: center;
          }
          @media (max-width: 768px) {
            .container {
              margin: 10px;
              padding: 20px;
              width: 95%;
            }
            th,
            td {
              font-size: 14px;
              padding: 10px;
            }
            .eligibility {
              font-size: 16px;
            }
            nav {
              flex-direction: column;
              align-items: flex-start;
            }
            nav a {
              margin-bottom: 10px;
            }
          }
        </style>
      </head>
      <body>
        <nav>
          <span>Welcome, ${req.session.username} (Student)</span>
          <a href="/logout">Logout</a>
        </nav>
        <div class="container">
          <h2>Your Marks</h2>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              ${marksRows}
            </tbody>
          </table>
          <div class="eligibility ${eligibility === 'Eligible' ? 'eligible' : 'ineligible'}">
            Eligibility: <span class="${eligibility === 'Eligible' ? 'eligible' : 'ineligible'}">${eligibility}</span>
            <br />
            <strong>Reasons:</strong>
            ${reasonsHtml}
          </div>
          <div style="margin-top: 20px;">
            <strong>Attendance Percentage:</strong> ${attendancePercent}%
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error loading student dashboard:', err);
    res.status(500).send('Error loading student dashboard');
  }
});

// Start server after DB initialization
initializeDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Server failed to start:', err);
    process.exit(1); // Exit the process if the server fails to start
  });
