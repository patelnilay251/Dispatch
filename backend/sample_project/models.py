class TodoStore:
    def __init__(self):
        self.todos = []
        self.next_id = 1

    def get_all(self):
        return self.todos

    def add(self, title):
        todo = {
            "id": self.next_id,
            "title": title,
            "completed": False
        }
        self.next_id += 1
        self.todos.append(todo)
        return todo

    def delete(self, todo_id):
        # BUG: doesn't check if todo exists, no return value
        self.todos = [t for t in self.todos if t["id"] != todo_id]

    def toggle(self, todo_id):
        for todo in self.todos:
            if todo["id"] == todo_id:
                todo["completed"] = not todo["completed"]
                return todo
        # BUG: returns None silently if not found