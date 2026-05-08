SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS daily_report
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'reporter'@'%' IDENTIFIED BY 'reporter123';
GRANT ALL PRIVILEGES ON daily_report.* TO 'reporter'@'%';
FLUSH PRIVILEGES;

USE daily_report;

CREATE TABLE IF NOT EXISTS engineers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  abbr VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  order_no VARCHAR(50),
  customer VARCHAR(100) NOT NULL,
  contact_name VARCHAR(50),
  contact_phone VARCHAR(20),
  product_version VARCHAR(50),
  install_address VARCHAR(500),
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES engineers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS engineer_projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  project_id INT NOT NULL,
  impl_days INT DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eng_proj (engineer_id, project_id),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  project_id INT NOT NULL,
  report_date DATE NOT NULL,
  impl_day INT NOT NULL,
  plan_title VARCHAR(500) NOT NULL,
  tasks JSON NOT NULL,
  progress TINYINT NOT NULL,
  status ENUM('complete','ongoing','blocked') NOT NULL,
  issues TEXT,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report (engineer_id, project_id, report_date),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tomorrow_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  report_date DATE NOT NULL,
  destination ENUM('existing_project','new_project','back_to_office','other') NOT NULL,
  project_id INT,
  new_project_customer VARCHAR(100),
  new_project_name VARCHAR(200),
  new_project_order VARCHAR(50),
  new_project_contact VARCHAR(50),
  new_project_phone VARCHAR(20),
  new_project_version VARCHAR(50),
  new_project_address VARCHAR(500),
  other_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tomorrow (engineer_id, report_date),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 种子数据
INSERT IGNORE INTO engineers (name, abbr) VALUES
('王涛', '王'), ('张宏洋', '张'), ('周继成', '周'), ('张学龙', '张');

INSERT IGNORE INTO projects
  (name, order_no, customer, contact_name, contact_phone, product_version, install_address, created_by)
VALUES
  ('清科管理·AnyShare部署', '00725547', '清科管理', '张老师', '18612726926',
   'AS7066', '北京市朝阳区霄云路40号院1号楼国航世纪大厦21层', 1);

INSERT IGNORE INTO engineer_projects (engineer_id, project_id, impl_days)
SELECT e.id, p.id, 11
FROM engineers e, projects p
WHERE e.name IN ('王涛','张宏洋','周继成') AND p.order_no = '00725547';

-- ====== 以下为后续新增字段迁移 ======

ALTER TABLE daily_reports ADD COLUMN next_plan TEXT AFTER issues;

ALTER TABLE projects ADD COLUMN manufacturer VARCHAR(100) AFTER install_address;
ALTER TABLE projects ADD COLUMN agent VARCHAR(100) AFTER manufacturer;
ALTER TABLE projects ADD COLUMN tech_lead VARCHAR(50) AFTER agent;
ALTER TABLE projects ADD COLUMN service_manager VARCHAR(50) AFTER tech_lead;

CREATE TABLE IF NOT EXISTS work_hours (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  project_id INT NOT NULL,
  report_date DATE NOT NULL,
  hours DECIMAL(4,1) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_work_hours (engineer_id, project_id, report_date),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
