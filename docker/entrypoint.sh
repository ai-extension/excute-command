#!/bin/bash

# Create user if SSH_USER and SSH_PASSWORD are set
if [ -n "$SSH_USER" ] && [ -n "$SSH_PASSWORD" ]; then
    echo "Creating user $SSH_USER..."
    # Create user if it doesn't exist
    if ! id "$SSH_USER" &>/dev/null; then
        useradd -m -s /bin/bash "$SSH_USER"
    fi
    # Set password
    echo "$SSH_USER:$SSH_PASSWORD" | chpasswd
    # Add to sudo group
    usermod -aG sudo "$SSH_USER"
    # Allow sudo without password for this user
    echo "$SSH_USER ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
    
    # Copy root's .ssh to the new user's home so they can also use keys
    mkdir -p "/home/$SSH_USER/.ssh"
    cp -r /root/.ssh/* "/home/$SSH_USER/.ssh/"
    chown -R "$SSH_USER:$SSH_USER" "/home/$SSH_USER/.ssh"
    chmod 700 "/home/$SSH_USER/.ssh"
    chmod 600 "/home/$SSH_USER/.ssh/"*
fi

# Start SSH daemon
service ssh start

# Execute the original command
exec "$@"
