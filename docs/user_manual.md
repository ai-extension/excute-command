# 📖 CSM User Manual

If you’ve never used a server management tool before, this guide is for you. We’ll explain what everything is and how it all fits together in plain English.

---

## 🌟 What is CSM?
Think of CSM as a **Remote Control for your Computers**. 

Normally, to fix a server or run a backup, a programmer has to type complicated commands into a black terminal screen. CSM lets you turn those complicated commands into **Simple Buttons** that anyone on your team can click.

---

## 🧩 The Big Three Concepts

### 1. Servers (The "Who")
A **Server** is just a computer sitting in a data center somewhere. CSM needs to know how to "talk" to it.
- **Analogy**: Adding a server to CSM is like adding a new contact to your phone. Once you add it, you can "call" it anytime to give it instructions.

### 2. Workflows (The "What")
A **Workflow** is a list of instructions for the server. 
- **Example**: 
  1. Login to Server.
  2. Download latest website files.
  3. Restart the website.
- **Analogy**: It's like a cooking recipe. You list the steps in order, and CSM follows them perfectly every time.

### 3. Pages (The "Friendly Face")
A **Page** is what your staff actually sees. It hides all the technical "code" and just shows a form and a button.
- **Analogy**: It's like the interface of a microwave. You don't need to know how the electricity works; you just press the "Popcorn" button.

---

## 🛠️ Common Scenarios

### "I want to let my support team restart the app."
1. You create a **Workflow** that runs the restart command.
2. You create a **Page** with a big red button labeled "Restart App".
3. You give your support team the link to that Page. They click it, and the app restarts safely.

### "I want to run a backup every night."
1. You create a **Workflow** that copies your files to a safe place.
2. You create a **Schedule** (like an alarm clock) that tells CSM to run that workflow at 2:00 AM every night.

---

## 📚 Simple Glossary
- **Command**: An instruction for the computer.
- **Variable**: A placeholder, like `[Server_Name]`.
- **Log**: A diary of what happened when a workflow ran.
- **Dashboard**: Your main home screen.

---

## 👋 Ready to start?
Head over to the **[🚀 Getting Started Guide](getting_started.md)** for your first hands-on tutorial!
