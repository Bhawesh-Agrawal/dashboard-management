-- Seed motivational quotes for the Academic Command Center
-- Run this SQL to populate the quotes table with inspirational content

INSERT INTO quotes (id, text, source, tags, created_at) VALUES
-- Productivity & Focus
(gen_random_uuid(), 'The secret of getting ahead is getting started.', 'Mark Twain', ARRAY['productivity', 'motivation'], NOW()),
(gen_random_uuid(), 'It is not enough to be busy. The question is: what are we busy about?', 'Henry David Thoreau', ARRAY['productivity', 'focus'], NOW()),
(gen_random_uuid(), 'The way to get started is to quit talking and begin doing.', 'Walt Disney', ARRAY['productivity', 'action'], NOW()),
(gen_random_uuid(), 'Focus on being productive instead of busy.', 'Tim Ferriss', ARRAY['productivity', 'focus'], NOW()),
(gen_random_uuid(), 'Action is the foundational key to all success.', 'Pablo Picasso', ARRAY['productivity', 'action'], NOW()),

-- Perseverance & Resilience
(gen_random_uuid(), 'It does not matter how slowly you go as long as you do not stop.', 'Confucius', ARRAY['perseverance', 'growth'], NOW()),
(gen_random_uuid(), 'Fall seven times, stand up eight.', 'Japanese Proverb', ARRAY['perseverance', 'resilience'], NOW()),
(gen_random_uuid(), 'The only impossible journey is the one you never begin.', 'Tony Robbins', ARRAY['perseverance', 'courage'], NOW()),
(gen_random_uuid(), 'Success is not final, failure is not fatal: it is the courage to continue that counts.', 'Winston Churchill', ARRAY['perseverance', 'courage'], NOW()),
(gen_random_uuid(), 'Our greatest glory is not in never falling, but in rising every time we fall.', 'Oliver Goldsmith', ARRAY['perseverance', 'resilience'], NOW()),

-- Learning & Growth
(gen_random_uuid(), 'The beautiful thing about learning is that nobody can take it away from you.', 'B.B. King', ARRAY['learning', 'growth'], NOW()),
(gen_random_uuid(), 'Education is the most powerful weapon which you can use to change the world.', 'Nelson Mandela', ARRAY['learning', 'impact'], NOW()),
(gen_random_uuid(), 'The more that you read, the more things you will know. The more that you learn, the more places you will go.', 'Dr. Seuss', ARRAY['learning', 'growth'], NOW()),
(gen_random_uuid(), 'An investment in knowledge pays the best interest.', 'Benjamin Franklin', ARRAY['learning', 'investment'], NOW()),
(gen_random_uuid(), 'Live as if you were to die tomorrow. Learn as if you were to live forever.', 'Mahatma Gandhi', ARRAY['learning', 'growth'], NOW()),

-- Discipline & Consistency
(gen_random_uuid(), 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Aristotle', ARRAY['discipline', 'habit'], NOW()),
(gen_random_uuid(), 'Motivation is what gets you started. Habit is what keeps you going.', 'Jim Ryun', ARRAY['discipline', 'habit'], NOW()),
(gen_random_uuid(), 'Success is the sum of small efforts, repeated day in and day out.', 'Robert Collier', ARRAY['discipline', 'consistency'], NOW()),
(gen_random_uuid(), 'Discipline is the bridge between goals and accomplishment.', 'Jim Rohn', ARRAY['discipline', 'achievement'], NOW()),
(gen_random_uuid(), 'Small daily improvements over time lead to stunning results.', 'Robin Sharma', ARRAY['discipline', 'growth'], NOW()),

-- Mindset & Attitude
(gen_random_uuid(), 'Your attitude, not your aptitude, will determine your altitude.', 'Zig Ziglar', ARRAY['mindset', 'attitude'], NOW()),
(gen_random_uuid(), 'The mind is everything. What you think you become.', 'Buddha', ARRAY['mindset', 'growth'], NOW()),
(gen_random_uuid(), 'Believe you can and you are halfway there.', 'Theodore Roosevelt', ARRAY['mindset', 'belief'], NOW()),
(gen_random_uuid(), 'Positive thinking will let you do everything better than negative thinking will.', 'Zig Ziglar', ARRAY['mindset', 'positivity'], NOW()),
(gen_random_uuid(), 'The only limit to our realization of tomorrow is our doubts of today.', 'Franklin D. Roosevelt', ARRAY['mindset', 'belief'], NOW()),

-- Time & Balance
(gen_random_uuid(), 'The key is not to prioritize your schedule, but to schedule your priorities.', 'Stephen Covey', ARRAY['time', 'priority'], NOW()),
(gen_random_uuid(), 'Lost time is never found again.', 'Benjamin Franklin', ARRAY['time', 'urgency'], NOW()),
(gen_random_uuid(), 'You will never find time for anything. If you want time, you must make it.', 'Charles Buxton', ARRAY['time', 'proactivity'], NOW()),
(gen_random_uuid(), 'The bad news is time flies. The good news is you are the pilot.', 'Michael Altshuler', ARRAY['time', 'control'], NOW());
