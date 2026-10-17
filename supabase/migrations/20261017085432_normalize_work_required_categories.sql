-- Categories are already determined by work_subcategory_ids. Remove the
-- duplicated single-category value so one Work Required can span categories.
update public."entity_workRequired"
set data = data - 'work_category_id'
where data ? 'work_category_id';
