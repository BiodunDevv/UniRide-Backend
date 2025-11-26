require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Admin = require("../src/models/Admin");
const College = require("../src/models/College");
const Department = require("../src/models/Department");
const Student = require("../src/models/Student");
const logger = require("../src/config/logger");

const seedDatabase = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info("Starting database seed...");

    // Create super admin
    const superAdmin = await Admin.findOne({
      email: process.env.DEFAULT_ADMIN_EMAIL,
    });
    let adminId;

    if (!superAdmin) {
      const newAdmin = await Admin.create({
        first_name: process.env.DEFAULT_ADMIN_FIRST_NAME || "Super",
        last_name: process.env.DEFAULT_ADMIN_LAST_NAME || "Admin",
        email: process.env.DEFAULT_ADMIN_EMAIL || "admin@uniride.com",
        password: process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123",
        role: "super_admin",
      });
      adminId = newAdmin._id;
      logger.info(`✓ Super admin created: ${newAdmin.email}`);
    } else {
      adminId = superAdmin._id;
      logger.info(`✓ Super admin already exists: ${superAdmin.email}`);
    }

    // College and Department mappings (Bowen University)
    const collegesAndDepartments = {
      "College of Agriculture, Engineering and Science": {
        code: "COAES",
        departments: {
          Microbiology: "MIC",
          "Pure & Applied Biology": "BIO",
          Biochemistry: "BCH",
          "Industrial Chemistry": "CHM",
          Mathematics: "MTH",
          Statistics: "STA",
          Physics: "PHY",
          "Bachelor of Agriculture (B.Agric.)": "AGR",
          "Food Science and Technology": "FST",
          "Electrical/Electronics Engineering": "EEE",
          "Mechatronics Engineering": "MCT",
          "Agricultural Extension & Rural Development": "AER",
        },
      },
      "College of Management and Social Sciences": {
        code: "COMSS",
        departments: {
          Accounting: "ACC",
          "Banking and Finance": "BNF",
          "Business Administration": "BUS",
          "Industrial Relations & Personnel Management": "IRP",
          Economics: "ECO",
          Sociology: "SOC",
          "Political Science": "POL",
          "International Relations": "INT",
          "Political and Law": "PAL",
        },
      },
      "College of Law": {
        code: "COLAW",
        departments: {
          "Law (LL.B.)": "LAW",
        },
      },
      "College of Liberal Studies": {
        code: "COLBS",
        departments: {
          Music: "MUS",
          "Theatre Arts": "THA",
          English: "ENG",
          "History & International Studies": "HIS",
          "Religious Studies": "REL",
        },
      },
      "College of Health Sciences": {
        code: "COHES",
        departments: {
          Anatomy: "ANA",
          Physiology: "PHS",
          "Medicine & Surgery (MBBS)": "MED",
          "Nursing Science": "NUR",
          Physiotherapy: "PHT",
          "Public Health": "PHU",
          "Medical Laboratory Science (BMLS)": "MLS",
          "Nutrition & Dietetics": "NUT",
        },
      },
      "College of Computing and Communication Studies": {
        code: "COCCS",
        departments: {
          "Computer Science": "CSC",
          "Mass Communication": "MAS",
          "Communication Arts": "CMA",
          "Cyber Security": "CYB",
          "Software Engineering": "SEN",
          "Information Technology": "IFT",
        },
      },
      "College of Environmental Sciences": {
        code: "COEVS",
        departments: {
          Architecture: "ARC",
        },
      },
    };

    // Create colleges and departments
    const createdColleges = [];
    const departmentsList = [];

    for (const [collegeName, collegeData] of Object.entries(
      collegesAndDepartments
    )) {
      // Create college
      let college = await College.findOne({ code: collegeData.code });
      if (!college) {
        college = await College.create({
          name: collegeName,
          code: collegeData.code,
          created_by: adminId,
        });
        logger.info(`✓ College created: ${college.name}`);
      } else {
        logger.info(`✓ College already exists: ${college.name}`);
      }
      createdColleges.push(college);

      // Create departments for this college
      for (const [deptName, deptCode] of Object.entries(
        collegeData.departments
      )) {
        let department = await Department.findOne({ code: deptCode });
        if (!department) {
          department = await Department.create({
            name: deptName,
            code: deptCode,
            college_id: college._id,
            college_code: college.code,
            created_by: adminId,
          });
          logger.info(`  ✓ Department created: ${deptName} (${deptCode})`);
        } else {
          logger.info(
            `  ✓ Department already exists: ${deptName} (${deptCode})`
          );
        }
        departmentsList.push(department);
      }
    }

    /**
     * Generate matric number in BU format with department code
     * Format: BU{YY}{DEPT_CODE}{NUMBER}
     * Example: BU22CSC1005 (Computer Science), BU22ACC2001 (Accounting)
     */

    // Sample first names for each department student
    const firstNames = [
      "Abiodun",
      "Blessing",
      "Chioma",
      "Daniel",
      "Esther",
      "Faith",
      "Grace",
      "Henry",
      "Ibrahim",
      "Janet",
      "Kingsley",
      "Lucy",
      "Michael",
      "Nancy",
      "Oluwaseun",
      "Peace",
      "Queen",
      "Rachel",
      "Samuel",
      "Tunde",
      "Uche",
      "Victoria",
      "William",
      "Xavier",
      "Yemi",
      "Zainab",
      "Adebayo",
      "Bukola",
      "Cynthia",
      "David",
      "Elizabeth",
      "Felix",
      "Gloria",
      "Hassan",
      "Ibukun",
      "Joy",
      "Kehinde",
      "Lilian",
      "Matthew",
      "Ngozi",
      "Oluwatobi",
      "Precious",
    ];

    const lastNames = [
      "Ajayi",
      "Bello",
      "Chukwu",
      "Dada",
      "Eze",
      "Fashola",
      "Gbenga",
      "Hassan",
      "Idowu",
      "James",
      "Kalu",
      "Lawal",
      "Musa",
      "Nwachukwu",
      "Okafor",
      "Peters",
      "Quadri",
      "Raji",
      "Salami",
      "Taiwo",
      "Usman",
      "Vincent",
      "Williams",
      "Xavier",
      "Yusuf",
      "Zubair",
      "Adeyemi",
      "Bakare",
      "Chima",
      "Davies",
      "Emeka",
      "Francis",
      "Gabriel",
      "Habib",
      "Ike",
      "Joseph",
      "Kehinde",
      "Lukman",
      "Mohammed",
      "Ndidi",
      "Obi",
      "Paul",
    ];

    // Create one student per department (42 students)
    logger.info("\n=== Creating students for each department ===");
    let studentIndex = 0;
    const createdStudents = [];

    for (const department of departmentsList) {
      const college = createdColleges.find(
        (c) => c._id.toString() === department.college_id.toString()
      );

      // Generate unique student data
      const firstName = firstNames[studentIndex % firstNames.length];
      const lastName = lastNames[studentIndex % lastNames.length];
      const deptCode = department.code;
      const matricNo = `BU22${deptCode}${String(studentIndex + 1001).padStart(4, "0")}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.bowenuniversity.edu.ng`;

      // Check if student already exists
      const existingStudent = await Student.findOne({ matric_no: matricNo });

      if (!existingStudent) {
        const student = await Student.create({
          matric_no: matricNo,
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: `080${String(10000000 + studentIndex).substring(0, 8)}`,
          level: [100, 200, 300, 400][studentIndex % 4], // Distribute across levels
          college_id: college._id,
          department_id: department._id,
          password: firstName.length >= 6 ? firstName : `${firstName}123`, // Ensure min 6 chars
          requires_password_change: true, // Force password change on first login
        });
        createdStudents.push(student);
        const pwd = firstName.length >= 6 ? firstName : `${firstName}123`;
        logger.info(
          `  ✓ ${department.name}: ${matricNo} - ${firstName} ${lastName} (Password: ${pwd})`
        );
      } else {
        createdStudents.push(existingStudent);
      }

      studentIndex++;
    }

    // Create default test student (Muhammed Abiodun)
    logger.info("\n=== Creating default test student ===");
    const defaultStudent = {
      matric_no: "BU22CSC1005",
      first_name: "Muhammed",
      last_name: "Abiodun",
      email: "muhammed.abiodun@student.bowenuniversity.edu.ng",
      phone: "08012345678",
      level: 400,
      department_code: "CSC",
    };

    const existing = await Student.findOne({
      matric_no: defaultStudent.matric_no,
    });
    if (!existing) {
      const department = departmentsList.find(
        (d) => d.code === defaultStudent.department_code
      );
      if (department) {
        const college = createdColleges.find(
          (c) => c._id.toString() === department.college_id.toString()
        );

        const student = await Student.create({
          matric_no: defaultStudent.matric_no,
          first_name: defaultStudent.first_name,
          last_name: defaultStudent.last_name,
          email: defaultStudent.email,
          phone: defaultStudent.phone,
          level: defaultStudent.level,
          college_id: college._id,
          department_id: department._id,
          password: "123456", // Default password
          requires_password_change: false, // No forced password change
        });
        createdStudents.push(student);
        logger.info(
          `✓ Default student created: ${student.matric_no} - ${student.first_name} ${student.last_name} (Password: 123456)`
        );
      } else {
        logger.warn(
          `⚠ Could not find Computer Science department for default student`
        );
      }
    } else {
      logger.info(`✓ Default student already exists: ${existing.matric_no}`);
    }

    logger.info("\n=== Database seeding completed successfully ===");
    logger.info(`✓ Colleges: ${createdColleges.length}`);
    logger.info(`✓ Departments: ${departmentsList.length}`);
    logger.info(
      `✓ Students: ${createdStudents.length} (1 per department + default)`
    );
    logger.info(
      `✓ Default student: BU22CSC1005 (Muhammed Abiodun) - Password: 123456`
    );
    logger.info(
      `✓ All other students: Password is their first name (add '123' if < 6 chars)`
    );
    logger.info(`✓ Students must change password on first login`);
    logger.info(`✓ Super admin: ${process.env.DEFAULT_ADMIN_EMAIL}`);
    logger.info("===============================================\n");

    process.exit(0);
  } catch (error) {
    logger.error(`Seed failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
};

// Run seed
seedDatabase();
