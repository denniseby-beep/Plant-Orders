-- Example SQL schema for role-based access control

-- 1. User profiles table
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz default now()
);

-- 2. Roles table
create table roles (
  id serial primary key,
  name text unique not null -- e.g. 'admin', 'operator', 'customer', 'manager'
);

-- 3. User roles join table
create table user_roles (
  user_id uuid references profiles(id) on delete cascade,
  role_id integer references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- 4. Companies table
create table companies (
  id serial primary key,
  name text unique not null
);

-- 5. User companies join table (for customer assignments)
create table user_companies (
  user_id uuid references profiles(id) on delete cascade,
  company_id integer references companies(id) on delete cascade,
  primary key (user_id, company_id)
);

-- 6. Orders table (simplified)
create table orders (
  id serial primary key,
  company_id integer references companies(id),
  created_by uuid references profiles(id),
  ... -- other order fields
);

-- 7. Example: Insert roles
insert into roles (name) values ('admin'), ('operator'), ('customer'), ('manager');
